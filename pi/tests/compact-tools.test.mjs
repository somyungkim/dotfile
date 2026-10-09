import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const root = join(execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim(), "@earendil-works/pi-coding-agent");
const req = createRequire(join(root, "package.json"));
const { createJiti } = req("jiti");
const jiti = createJiti(import.meta.url, { alias: {
  "@earendil-works/pi-coding-agent": join(root, "dist/index.js"),
  "@earendil-works/pi-tui": req.resolve("@earendil-works/pi-tui"),
} });
const { compactRenderers, CompactToolView, default: extension } = await jiti.import("../extensions/compact-tools.ts");
const { createBashToolDefinition, createReadToolDefinition, createWriteToolDefinition, createEditToolDefinition, ToolExecutionComponent } = await import(pathToFileURL(join(root, "dist/index.js")));
const { loadThemeFromPath, setThemeInstance } = await import(pathToFileURL(join(root, "dist/modes/interactive/theme/theme.js")));
const { codemodeRenderers } = await import(pathToFileURL(join(root, "dist/extensions/codemode/renderer.js")));
const { Text, stripTerminalSequences, visibleWidth, setKeybindings } = await import(pathToFileURL(req.resolve("@earendil-works/pi-tui")));
const { KeybindingsManager } = await import(pathToFileURL(join(root, "dist/core/keybindings.js")));
setKeybindings(new KeybindingsManager());
const theme = loadThemeFromPath(new URL("../themes/dark-flat.json", import.meta.url).pathname, "truecolor");
setThemeInstance(theme);
const raw = (component, width = 80) => component.render(width).map((line) => stripTerminalSequences(line).trimEnd()).join("\n");
const ctx = (options = {}) => ({
  args: {}, toolCallId: "test", invalidate() {}, state: {}, cwd: process.cwd(),
  executionStarted: false, argsComplete: false, isPartial: true, expanded: false,
  showImages: false, isError: false, outputPad: 1, ...options,
});
function tool(name, args, definition) {
  return new ToolExecutionComponent(name, "test", args, { showImages: false },
    { ...definition, ...compactRenderers(name, definition) }, { requestRender() {} }, process.cwd());
}
function result(text, extra = {}) {
  return { content: [{ type: "text", text }], details: undefined, isError: false, ...extra };
}

test("theme changes only its name and tool background roles", () => {
  const original = JSON.parse(readFileSync(join(root, "dist/modes/interactive/theme/dark.json"), "utf8"));
  const custom = JSON.parse(readFileSync(new URL("../themes/dark-flat.json", import.meta.url), "utf8"));
  original.name = "dark-flat";
  for (const key of ["toolPendingBg", "toolSuccessBg", "toolErrorBg"]) {
    original.colors[key] = "";
    assert.ok(!theme.bg(key, "sample").includes("\x1b[48"));
  }
  assert.deepEqual(custom, original);
});

test("extension registers only a presentation resolver", () => {
  let resolver;
  extension({ registerToolRenderer: (value) => { resolver = value; } });
  let calls = 0;
  const native = createReadToolDefinition(process.cwd());
  const rendered = resolver("read", () => { calls++; return native; });
  assert.equal(calls, 1);
  assert.equal(rendered.execute, native.execute);
  assert.equal(rendered.parameters, native.parameters);
  assert.equal(rendered.renderShell, "self");
});

test("specialized plugin UIs and incomplete renderer definitions pass through unchanged", () => {
  const native = { renderCall() {}, renderResult() {}, renderShell: "self" };
  for (const name of ["datadog", "ddconfig", "ask_user_question", "custom_tool"]) {
    assert.equal(compactRenderers(name, native), native);
  }
  assert.equal(compactRenderers("bash", undefined), undefined);
  const partial = { renderCall() {} };
  assert.equal(compactRenderers("bash", partial), partial);
});

test("outer blank padding is removed but internal output blank lines remain", () => {
  const view = new CompactToolView(new Text("\nfirst\n\nlast\n", 0, 0), {
    expanded: true, role: "result", padding: 0, prefix: "",
  }, theme);
  assert.equal(raw(view), "first\n\nlast");
});

test("collapsed tool calls are one row with a visible expansion hint", () => {
  const bash = createBashToolDefinition(process.cwd());
  const component = tool("bash", { command: "echo first\necho second\necho third" }, bash);
  const text = raw(component);
  assert.ok(text.includes("echo first"));
  assert.ok(!text.includes("echo second"));
  assert.match(text, /ctrl\+o/i);
  assert.equal(component.render(80).length, 2); // Pi's separator plus the call.
  component.setExpanded(true);
  assert.ok(raw(component).includes("echo second"));
});

test("pending, running, success, and error have distinct visible status markers", () => {
  const native = createBashToolDefinition(process.cwd());
  const renderer = compactRenderers("bash", native);
  for (const [options, marker] of [
    [{}, "·"], [{ executionStarted: true }, "…"],
    [{ isPartial: false }, "✓"], [{ isPartial: false, isError: true }, "! failed"],
  ]) {
    assert.ok(raw(renderer.renderCall({ command: "echo hello" }, theme, ctx(options))).includes(marker));
  }
});

test("bash results remain background-free and expanded output retains the full native result", () => {
  const component = tool("bash", { command: "some command" }, createBashToolDefinition(process.cwd()));
  const output = Array.from({ length: 30 }, (_, i) => `output-${i}`).join("\n");
  const data = result(output, { durationMs: 250 });
  component.updateResult(data, false);
  const collapsed = raw(component);
  assert.match(collapsed, /more output/);
  assert.ok(collapsed.includes("output-29"));
  assert.ok(component.render(80).every((line) => !line.includes("\x1b[48")));
  component.setExpanded(true);
  const expanded = raw(component);
  for (let i = 0; i < 30; i++) assert.ok(expanded.includes(`output-${i}`));
  assert.ok(expanded.includes("Took 0.3s"));
  assert.equal(data.content[0].text, output);
});

test("errors stay visibly failed instead of relying on a red background", () => {
  const component = tool("bash", { command: "false" }, createBashToolDefinition(process.cwd()));
  component.updateResult(result("Command exited with code 1", { isError: true }), false);
  assert.match(raw(component), /! failed/);
  assert.match(raw(component), /exited with code 1/);
});

test("read content remains collapsed normally and expands without losing lines", () => {
  const component = tool("read", { path: "example.txt" }, createReadToolDefinition(process.cwd()));
  component.updateResult(result("first\nlast"), false);
  assert.ok(!raw(component).includes("first"));
  assert.equal(component.render(80).length, 2);
  component.setExpanded(true);
  assert.ok(raw(component).includes("first\n"));
  assert.ok(raw(component).includes("last"));
});

test("write content is summarized in the header and remains available when expanded", () => {
  const component = tool("write", { path: "example.txt", content: "first\nsecond\nthird" }, createWriteToolDefinition(process.cwd()));
  component.updateResult(result("Written"), false);
  assert.ok(!raw(component).includes("second"));
  component.setExpanded(true);
  assert.ok(raw(component).includes("second"));
});

test("native edit state and diff highlighting survive wrapping, reuse, and expansion", () => {
  const definition = createEditToolDefinition(process.cwd());
  const component = tool("edit", { path: "example.txt", edits: [{ oldText: "old", newText: "new" }] }, definition);
  component.updateResult(result("Updated", { details: { diff: "-1 old\n+1 new", firstChangedLine: 1 } }), false);
  assert.ok(!raw(component).includes("old"));
  component.setExpanded(true);
  assert.ok(raw(component).includes("old"));
  assert.ok(raw(component).includes("new"));
  component.setExpanded(false);
  component.setExpanded(true);
  assert.ok(raw(component).includes("new"));
});

test("truncation is disclosed in the compact view and the saved-output path remains expandable", () => {
  const component = tool("bash", { command: "large output" }, createBashToolDefinition(process.cwd()));
  component.updateResult(result("some output", { details: {
    truncation: { truncated: true, truncatedBy: "lines", outputLines: 1, totalLines: 999 },
    fullOutputPath: "/tmp/complete-output.txt",
  } }), false);
  assert.match(raw(component), /Output truncated/);
  component.setExpanded(true);
  assert.ok(raw(component).includes("/tmp/complete-output.txt"));
});

test("codemode keeps nested failures visible and expanded script/output intact", () => {
  const component = tool("codemode", { code: "text('first');\ntext('second');" }, codemodeRenderers);
  component.updateResult(result("full result", { details: { calls: [
    { name: "read", args: "file", status: "error", error: "File not found" },
  ] } }), false);
  assert.match(raw(component), /1 nested tool call\(s\) failed/);
  component.setExpanded(true);
  assert.ok(raw(component).includes("text('second')"));
  assert.ok(raw(component).includes("File not found"));
  assert.ok(raw(component).includes("full result"));
});

test("the host's click-to-expand behavior still works", () => {
  const component = tool("read", { path: "example.txt" }, createReadToolDefinition(process.cwd()));
  component.updateResult(result("visible only when expanded"), false);
  component.render(80);
  const handled = component.handleMouse({ type: "click", button: "left", x: 4, y: 1, width: 80, height: 10 });
  assert.equal(handled?.handled, true);
  assert.ok(raw(component).includes("visible only when expanded"));
});

test("all narrow widths remain within terminal bounds", () => {
  for (const width of [0, 1, 2, 8, 20, 80]) {
    const component = tool("bash", { command: "echo 한국어 example with a long command" }, createBashToolDefinition(process.cwd()));
    component.updateResult(result("a long result with unicode 日本語\nnext\nlast", { isError: true }), false);
    assert.ok(component.render(width).every((line) => visibleWidth(line) <= width));
    component.setExpanded(true);
    assert.ok(component.render(width).every((line) => visibleWidth(line) <= width));
  }
});
