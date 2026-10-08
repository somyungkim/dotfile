import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { setImmediate } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import test from "node:test";

// Exercise the installed Pi implementation, without a session or model requests.
const npmRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
const piRoot = join(npmRoot, "@earendil-works/pi-coding-agent");
const requirePi = createRequire(join(piRoot, "package.json"));
const { createJiti } = requirePi("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@earendil-works/pi-coding-agent": join(piRoot, "dist/index.js"),
    "@earendil-works/pi-tui": requirePi.resolve("@earendil-works/pi-tui"),
  },
});
const { QueueEditor, default: extension } = await jiti.import("../extensions/queue-editor/index.ts");
const { KeybindingsManager } = await import(pathToFileURL(join(piRoot, "dist/core/keybindings.js")));
const { InteractiveMode } = await import(pathToFileURL(join(piRoot, "dist/modes/interactive/interactive-mode.js")));
const { setKeybindings } = await import(pathToFileURL(requirePi.resolve("@earendil-works/pi-tui")));
const config = JSON.parse(readFileSync(new URL("../keybindings.json", import.meta.url), "utf8"));
const identity = (text) => text;
const theme = {
  borderColor: identity,
  selectList: Object.fromEntries(
    ["selectedPrefix", "selectedText", "description", "scrollInfo", "noMatch"].map((key) => [key, identity]),
  ),
};

function fixture({ idle = false, text = "Please add tests" } = {}) {
  const bindings = new KeybindingsManager(config);
  setKeybindings(bindings);
  const state = { idle, queued: [], submitted: [], cleared: 0, completions: [] };
  const editor = new QueueEditor({ requestRender() {} }, theme, bindings, () => state.idle);
  // Use Pi's real follow-up handler, stubbing only session delivery and repainting.
  const host = {
    editor,
    session: {
      isCompacting: false,
      get isStreaming() { return !state.idle; },
      async prompt(text, options) {
        assert.equal(options.streamingBehavior, "followUp");
        state.queued.push(text);
      },
    },
    updatePendingMessagesDisplay() {},
    ui: { requestRender() {} },
  };
  editor.actionHandlers.set("app.message.followUp", () => InteractiveMode.prototype.handleFollowUp.call(host));
  editor.actionHandlers.set("app.clear", () => state.cleared++);
  editor.onSubmit = (value) => state.submitted.push(value);
  editor.setText(text);
  const provide = (values) => editor.setAutocompleteProvider({
    async getSuggestions(lines, line, col) {
      state.completions.push(lines[line].slice(0, col));
      return { prefix: lines[line].slice(0, col), items: values.map((value) => ({ value, label: value })) };
    },
    applyCompletion(_lines, _line, _col, item) {
      return { lines: [item.value], cursorLine: 0, cursorCol: item.value.length };
    },
  });
  return { editor, bindings, state, provide };
}

test("bindings free Option+Enter for newline, retain fallbacks, and leave Enter alone", () => {
  const { bindings } = fixture();
  assert.deepEqual(bindings.getConflicts(), []);
  assert.deepEqual(bindings.getKeys("app.message.followUp"), ["tab"]);
  assert.deepEqual(bindings.getKeys("tui.input.submit"), ["enter"]);
  assert.deepEqual(bindings.getKeys("tui.input.newLine"), ["alt+enter", "shift+enter", "ctrl+j"]);
});

for (const [name, key] of [
  ["Option+Enter (legacy)", "\x1b\r"],
  ["Option+Enter (CSI-u)", "\x1b[13;3u"],
  ["Option+Enter (xterm)", "\x1b[27;3;13~"],
  ["Shift+Enter", "\x1b[13;2u"],
  ["Ctrl+J", "\n"],
]) {
  test(`${name} inserts a newline without dispatching`, () => {
    const { editor, state } = fixture({ text: "first" });
    editor.handleInput(key);
    assert.equal(editor.getText(), "first\n");
    assert.deepEqual(state.queued, []);
    assert.deepEqual(state.submitted, []);
  });
}

for (const idle of [false, true]) {
  test(`Enter delegates to native submission when idle=${idle}`, () => {
    const { editor, state } = fixture({ idle });
    editor.handleInput("\r");
    assert.deepEqual(state.submitted, ["Please add tests"]);
    assert.deepEqual(state.queued, []);
  });
}

test("busy Tab delegates to the native follow-up callback and clears the draft", () => {
  const { editor, state } = fixture();
  editor.handleInput("\t");
  editor.handleInput("\t");
  assert.deepEqual(state.queued, ["Please add tests"]);
  assert.deepEqual(state.submitted, []);
  assert.equal(editor.getText(), "");
});

test("Tab preserves expanded pasted content through the follow-up callback", () => {
  const { editor, state } = fixture({ text: "" });
  const pasted = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");
  editor.handleInput(`\x1b[200~${pasted}\x1b[201~`);
  editor.handleInput("\t");
  assert.deepEqual(state.queued, [pasted]);
});

for (const text of ["", "   ", "\n"]) {
  test(`empty/whitespace Tab does not queue: ${JSON.stringify(text)}`, () => {
    const { editor, state } = fixture({ text });
    editor.handleInput("\t");
    assert.deepEqual(state.queued, []);
    assert.deepEqual(state.submitted, []);
  });
}

test("idle Tab performs native completion rather than submitting", async () => {
  const { editor, state, provide } = fixture({ idle: true, text: "file" });
  provide(["file.txt"]);
  editor.handleInput("\t");
  await setImmediate();
  assert.equal(editor.getText(), "file.txt");
  assert.deepEqual(state.queued, []);
  assert.deepEqual(state.submitted, []);
});

for (const text of ["/model", "/model gpt", "read @file", "read ./file", "read ~/file", "read src/file", 'read "./file']) {
  test(`busy Tab preserves explicit completion before a menu appears: ${text}`, async () => {
    const { editor, state, provide } = fixture({ text });
    provide(["completed"]);
    editor.handleInput("\t");
    await setImmediate();
    assert.equal(state.completions.length, 1);
    assert.deepEqual(state.queued, []);
    assert.deepEqual(state.submitted, []);
  });
}

test("an open autocomplete menu takes priority over busy Tab queueing", async () => {
  const { editor, state, provide } = fixture({ idle: true, text: "file" });
  provide(["file-a", "file-b"]);
  editor.handleInput("\t");
  await setImmediate();
  assert.equal(editor.isShowingAutocomplete(), true);
  state.idle = false;
  editor.handleInput("\t");
  assert.equal(editor.getText(), "file-a");
  assert.deepEqual(state.queued, []);
});

test("an empty Enter does not flush queued messages", () => {
  const { editor, state } = fixture();
  editor.handleInput("\t");
  editor.onSubmit = (text) => { if (text.trim()) state.submitted.push(text); };
  editor.handleInput("\r");
  assert.deepEqual(state.queued, ["Please add tests"]);
  assert.deepEqual(state.submitted, []);
});

test("other application shortcuts are preserved", () => {
  const { editor, state } = fixture();
  editor.handleInput("\x03");
  assert.equal(state.cleared, 1);
});

for (const idle of [false, true]) {
  test(`extension Tab shortcuts retain priority when idle=${idle}`, () => {
    const { editor, state } = fixture({ idle });
    let calls = 0;
    editor.onExtensionShortcut = () => { calls++; return true; };
    editor.handleInput("\t");
    assert.equal(calls, 1);
    assert.deepEqual(state.queued, []);
  });
}

test("extension installs only in TUI mode and restores the editor on shutdown", () => {
  const handlers = new Map();
  extension({
    on: (event, handler) => handlers.set(event, handler),
    registerMarkdownTransformer() {}, registerCommand() {}, appendEntry() {},
  });
  const factories = [];
  const ctx = {
    mode: "rpc", isIdle: () => true, sessionManager: { getBranch: () => [] },
    ui: { setEditorComponent: (factory) => factories.push(factory) },
  };
  handlers.get("session_start")({}, ctx);
  handlers.get("session_shutdown")({}, ctx);
  assert.equal(factories.length, 0);
  ctx.mode = "tui";
  handlers.get("session_start")({}, ctx);
  assert.equal(typeof factories[0], "function");
  handlers.get("session_shutdown")({}, ctx);
  assert.equal(factories[1], undefined);
});
