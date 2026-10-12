import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

// Real installed plugins, real short-lived shell jobs, no model requests.
process.env.PI_BG_DISABLE_UPDATE_CHECK = "1";
const root = join(execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim(), "@earendil-works/pi-coding-agent");
const { loadExtensions } = await import(pathToFileURL(join(root, "dist/core/extensions/loader.js")));
const { loadThemeFromPath } = await import(pathToFileURL(join(root, "dist/modes/interactive/theme/theme.js")));
const { KeybindingsManager } = await import(pathToFileURL(join(root, "dist/core/keybindings.js")));
const { stripTerminalSequences } = await import(pathToFileURL(join(root, "node_modules/@earendil-works/pi-tui/dist/index.js")));
const wrapper = new URL("../extensions/background-processes.ts", import.meta.url).pathname;
const theme = loadThemeFromPath(new URL("../themes/dark-flat.json", import.meta.url).pathname);
const todoEntry = join(homedir(), ".pi/agent/npm/node_modules/@juicesharp/rpiv-todo/index.ts");
const directories = new Set();
// Completion precedes the plugin's final notification-bookkeeping write. Keep
// test workspaces until Node drains its pending file I/O, rather than racing it.
process.on("exit", () => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

async function backgroundFixture({ cwd, sessionId, reason = "startup" } = {}) {
  if (!cwd) {
    cwd = mkdtempSync(join(tmpdir(), "pi-background-test-"));
    directories.add(cwd);
  }
  sessionId ??= `test-${randomUUID()}`;
  const loaded = await loadExtensions([wrapper], cwd);
  assert.deepEqual(loaded.errors, []);
  const extension = loaded.extensions[0];
  const notifications = [];
  let resolveCompletion;
  const completion = new Promise((resolve) => { resolveCompletion = resolve; });
  loaded.runtime.sendMessage = (message, options) => {
    notifications.push({ message, options });
    resolveCompletion({ message, options });
  };
  const ctx = {
    cwd, mode: "print", hasUI: false, isIdle: () => true,
    sessionManager: { getSessionId: () => sessionId },
    ui: { setStatus() {}, setWidget() {}, notify() {} },
  };
  const emit = async (event, data) => {
    for (const handler of extension.handlers.get(event) ?? []) await handler(data, ctx);
  };
  const call = (name, args) => extension.tools.get(name).definition.execute(name, args, new AbortController().signal, undefined, ctx);
  await emit("session_start", { reason });
  let closed = false;
  return {
    loaded, extension, ctx, notifications, call, cwd, sessionId,
    async wait() {
      let timer;
      try { return await Promise.race([completion, new Promise((_, reject) => { timer = setTimeout(() => reject(Error("Missing completion notification")), 8000); })]); }
      finally { clearTimeout(timer); }
    },
    async close(shutdownReason = "shutdown") {
      if (!closed) { closed = true; await emit("session_shutdown", { reason: shutdownReason }); }
    },
  };
}

test("package configuration filters automatic background activation and pins the validated version", () => {
  const config = JSON.parse(readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
  assert.deepEqual(config.packages.find((p) => typeof p === "object" && p.source.startsWith("npm:pi-background-tasks")), {
    source: "npm:pi-background-tasks@2.6.9", extensions: [],
  });
});

test("wrapper exposes process tools only and restores caller environment", async () => {
  const before = process.env.PI_BG_FEATURES;
  process.env.PI_BG_FEATURES = "process,delegate,fusion,attribution";
  const f = await backgroundFixture();
  try {
    assert.deepEqual([...f.extension.tools.keys()].sort(), ["bg_kill", "bg_logs", "bg_run", "bg_status"]);
    assert.equal(f.loaded.runtime.pendingProviderRegistrations.length, 0);
    assert.equal(f.extension.commands.has("fusion"), false);
    assert.ok(f.extension.shortcuts.has("ctrl+alt+b"));
    assert.equal(process.env.PI_BG_FEATURES, "process,delegate,fusion,attribution");
  } finally {
    await f.close();
    if (before === undefined) delete process.env.PI_BG_FEATURES;
    else process.env.PI_BG_FEATURES = before;
  }
});

test("activation errors do not leak feature flags into the host", async () => {
  const oldShell = process.env.PI_BG_POSIX_SHELL;
  const oldFeatures = process.env.PI_BG_FEATURES;
  const oldShortcut = process.env.PI_BG_DOCK_SHORTCUT;
  process.env.PI_BG_POSIX_SHELL = "not-a-shell-policy";
  try {
    const loaded = await loadExtensions([wrapper], process.cwd());
    assert.equal(loaded.errors.length, 1);
    assert.equal(process.env.PI_BG_FEATURES, oldFeatures);
    assert.equal(process.env.PI_BG_DOCK_SHORTCUT, oldShortcut);
  } finally {
    if (oldShell === undefined) delete process.env.PI_BG_POSIX_SHELL;
    else process.env.PI_BG_POSIX_SHELL = oldShell;
  }
});

test("background job returns early, notifies once, and preserves its output", async () => {
  const f = await backgroundFixture();
  try {
    const started = await f.call("bg_run", { name: "Success test", command: "sleep 0.2; printf bg-ok", isAgent: false });
    assert.equal(started.details.task.status, "running");
    const notification = await f.wait();
    assert.equal(notification.options.triggerTurn, true);
    assert.equal(f.notifications.length, 1);
    const taskId = started.details.task.id;
    const logs = await f.call("bg_logs", { taskId });
    assert.ok(logs.content.some((part) => part.type === "text" && part.text.includes("bg-ok")));
    const status = await f.call("bg_status", { taskId });
    assert.equal(status.details.tasks[0].status, "completed");
    assert.equal(status.details.tasks[0].exitCode, 0);
  } finally { await f.close(); }
});

test("a failed command is reported as failed, not completed", async () => {
  const f = await backgroundFixture();
  try {
    const started = await f.call("bg_run", { name: "Failure test", command: "exit 7", isAgent: false });
    await f.wait();
    const status = await f.call("bg_status", { taskId: started.details.task.id });
    assert.equal(status.details.tasks[0].status, "failed");
    assert.equal(status.details.tasks[0].exitCode, 7);
  } finally { await f.close(); }
});

test("stopping a job terminates only the launched test process", async () => {
  const f = await backgroundFixture();
  try {
    const started = await f.call("bg_run", { name: "Stop test", command: "sleep 30", isAgent: false });
    await f.call("bg_kill", { taskId: started.details.task.id });
    await f.wait();
    const status = await f.call("bg_status", { taskId: started.details.task.id });
    assert.equal(status.details.tasks[0].status, "killed");
    assert.throws(() => process.kill(started.details.task.pid, 0), { code: "ESRCH" });
  } finally { await f.close(); }
});

test("ordinary jobs are stopped on reload by default", async () => {
  const f = await backgroundFixture();
  try {
    const started = await f.call("bg_run", { name: "Reload stop test", command: "sleep 30", isAgent: false });
    await f.close("reload");
    assert.throws(() => process.kill(started.details.task.pid, 0), { code: "ESRCH" });
  } finally { await f.close(); }
});

test("explicit reload survival preserves the same ordinary process", async () => {
  const f = await backgroundFixture();
  let next;
  try {
    const started = await f.call("bg_run", { name: "Reload survival test", command: "sleep 1; printf survived", isAgent: false, surviveReload: true });
    await f.close("reload");
    next = await backgroundFixture({ cwd: f.cwd, sessionId: f.sessionId, reason: "reload" });
    const status = await next.call("bg_status", { taskId: started.details.task.id });
    assert.equal(status.details.tasks[0].pid, started.details.task.pid);
    await next.wait();
    const logs = await next.call("bg_logs", { taskId: started.details.task.id });
    assert.ok(logs.content.some((part) => part.type === "text" && part.text.includes("survived")));
  } finally {
    await next?.close();
    await f.close();
  }
});

test("the background task-manager UI loads and renders on Pi 1.1", async () => {
  const f = await backgroundFixture();
  let rendered;
  try {
    f.ctx.hasUI = true;
    f.ctx.mode = "tui";
    f.ctx.ui.custom = async (factory) => {
      const component = await factory({ requestRender() {}, terminal: { rows: 40, columns: 100 } }, theme, new KeybindingsManager(), () => {});
      try { rendered = component.render(100).map(stripTerminalSequences).join("\n"); }
      finally { component.dispose?.(); }
    };
    await f.extension.commands.get("tasks").handler("", f.ctx);
    assert.ok(rendered?.length > 0);
  } finally { await f.close(); }
});

test("todo panel uses the configured shortcut and survives branch replay", async () => {
  const loaded = await loadExtensions([todoEntry], process.cwd());
  assert.deepEqual(loaded.errors, []);
  const ext = loaded.extensions[0];
  assert.ok(ext.tools.has("todo"));
  assert.ok(ext.commands.has("todos"));
  assert.ok(ext.shortcuts.has("alt+t"));
  const entries = [], widgets = new Map();
  loaded.runtime.appendEntry = (customType, data) => entries.push({ type: "custom", customType, data });
  const ctx = {
    cwd: process.cwd(), mode: "tui", hasUI: true,
    sessionManager: { getSessionId: () => "todo-test", getBranch: () => entries },
    ui: { theme, setWidget(name, value) { if (value) widgets.set(name, value); else widgets.delete(name); }, getToolsExpanded: () => false },
  };
  const emit = async (name, data = {}) => { for (const fn of ext.handlers.get(name) ?? []) await fn(data, ctx); };
  const call = (params) => ext.tools.get("todo").definition.execute("todo-test", params, new AbortController().signal, undefined, ctx);
  try {
    await emit("session_start");
    for (let i = 1; i <= 8; i++) await call({ action: "create", subject: `Task ${i}` });
    await call({ action: "update", id: 1, status: "in_progress", activeForm: "Testing task one" });
    await call({ action: "update", id: 1, status: "completed" });
    await call({ action: "update", id: 2, status: "in_progress", activeForm: "Testing task two" });
    await emit("tool_execution_end", { toolName: "todo", isError: false });
    const factory = widgets.get("rpiv-todos");
    assert.equal(typeof factory, "function");
    const panel = factory({ requestRender() {} }, theme);
    const rows = panel.render(80);
    const rendered = rows.map(stripTerminalSequences).join("\n");
    assert.ok(rendered.includes("Todos"));
    assert.ok(rendered.includes("Testing task two"));
    assert.ok(rows.length <= 7); // six configured rows plus the plugin's spacer.
    assert.ok(rows.every((row) => !row.includes("\x1b[48")));
    await emit("session_shutdown");
    await emit("session_start");
    const restored = await call({ action: "list" });
    assert.equal(restored.details.tasks.length, 8);
    assert.equal(restored.details.tasks[0].status, "completed");
    assert.equal(restored.details.tasks[1].status, "in_progress");
  } finally { await emit("session_shutdown"); }
});
