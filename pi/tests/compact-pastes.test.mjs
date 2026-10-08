import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test, { after } from "node:test";

const root = join(execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim(), "@earendil-works/pi-coding-agent");
const requirePi = createRequire(join(root, "package.json"));
const { createJiti } = requirePi("jiti");
const jiti = createJiti(import.meta.url, { alias: {
  "@earendil-works/pi-coding-agent": join(root, "dist/index.js"),
  "@earendil-works/pi-tui": requirePi.resolve("@earendil-works/pi-tui"),
} });
const { CompactEditor, default: extension } = await jiti.import("../extensions/queue-editor/index.ts");
const { Presentations, PRESENTATION_ENTRY } = await jiti.import("../extensions/queue-editor/presentations.ts");
const { PasteStorage } = await jiti.import("../extensions/queue-editor/paste-storage.ts");
const { pastedFiles } = await jiti.import("../extensions/queue-editor/compact-editor.ts");
const { KeybindingsManager } = await import(pathToFileURL(join(root, "dist/core/keybindings.js")));
const { InteractiveMode } = await import(pathToFileURL(join(root, "dist/modes/interactive/interactive-mode.js")));
const { UserMessageComponent } = await import(pathToFileURL(join(root, "dist/modes/interactive/components/user-message.js")));
const { initTheme, getMarkdownTheme } = await import(pathToFileURL(join(root, "dist/modes/interactive/theme/theme.js")));
const { setKeybindings, visibleWidth } = await import(pathToFileURL(requirePi.resolve("@earendil-works/pi-tui")));
const config = JSON.parse(readFileSync(new URL("../keybindings.json", import.meta.url), "utf8"));
const directory = mkdtempSync(join(tmpdir(), "pi-compact-pastes-"));
const image = join(directory, "screenshot.png");
const file = join(directory, "report [final].txt");
writeFileSync(image, "image fixture - no image decoding is needed");
writeFileSync(file, "original file bytes");
mkdirSync(join(directory, "other"));
const otherFile = join(directory, "other", "report [final].txt");
writeFileSync(otherFile, "other file bytes");
after(() => rmSync(directory, { recursive: true, force: true }));
initTheme("dark", false);
const identity = (s) => s;
const theme = { borderColor: identity, selectList: Object.fromEntries(
  ["selectedPrefix", "selectedText", "description", "scrollInfo", "noMatch"].map((key) => [key, identity]),
) };
const strip = (s) => s.replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "").replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
const large = Array.from({ length: 20 }, (_, i) => `log line ${i}`).join("\n");
const bracketed = (text) => `\x1b[200~${text}\x1b[201~`;

function fixture(views = new Presentations()) {
  const bindings = new KeybindingsManager(config);
  setKeybindings(bindings);
  const state = { idle: false, submitted: [], queued: [] };
  const editor = new CompactEditor({ requestRender() {}, terminal: { rows: 40 } }, theme, bindings, () => state.idle, directory, views);
  assert.equal(editor.supportsAttachments, true);
  editor.onSubmit = (text) => state.submitted.push(text);
  const host = { editor, session: {
    isStreaming: true, isCompacting: false,
    async prompt(text, options) { assert.equal(options.streamingBehavior, "followUp"); state.queued.push(text); },
  }, updatePendingMessagesDisplay() {}, ui: { requestRender() {} } };
  editor.actionHandlers.set("app.message.followUp", () => InteractiveMode.prototype.handleFollowUp.call(host));
  return { editor, state, views };
}

for (const method of ["clipboard", "terminal"]) {
  test(`${method} image uses a compact label, but Enter receives its real path`, () => {
    const { editor, state, views } = fixture();
    if (method === "clipboard") editor.insertTextAtCursor(image);
    else editor.handleInput(bracketed(image));
    assert.match(editor.getText(), /^\[Image #\d+\]$/);
    assert.equal(editor.getExpandedText(), image);
    editor.handleInput("\r");
    assert.deepEqual(state.submitted, [image]);
    assert.match(views.render(image), /\[Image #\d+\]/);
    assert.ok(!views.render(image).includes(directory));
  });
}

test("multiple files with identical basenames keep distinct labels and exact paths", () => {
  const { editor, state } = fixture();
  const paths = `${file}\n${otherFile}`;
  editor.insertTextAtCursor(paths);
  assert.match(editor.getText(), /\[File #1: report \[final\]\.txt\]/);
  assert.match(editor.getText(), /\[File #2: report \[final\]\.txt\]/);
  assert.equal(editor.getExpandedText(), paths);
  editor.handleInput("\r");
  assert.deepEqual(state.submitted, [paths]);
  assert.equal(readFileSync(file, "utf8"), "original file bytes");
});

test("quoted and escaped paths are displayed compactly without changing submission syntax", () => {
  const { editor } = fixture();
  const quoted = `"${file}"`;
  editor.insertTextAtCursor(quoted);
  assert.match(editor.getText(), /\[File #/);
  assert.equal(editor.getExpandedText(), quoted);
  editor.setText("");
  const escaped = file.replaceAll(" ", "\\ ");
  editor.insertTextAtCursor(escaped);
  assert.equal(editor.getExpandedText(), escaped);
});

test("missing paths, directories, prose, and shell input remain uncollapsed", () => {
  for (const text of ["ordinary short text", directory, `${directory}/missing.png`, `please read ${image}`]) {
    const { editor } = fixture();
    editor.insertTextAtCursor(text);
    assert.equal(editor.getText(), text);
  }
  const { editor } = fixture();
  editor.setText("!cat ");
  editor.insertTextAtCursor(file);
  assert.equal(editor.getText(), `!cat ${file}`);
  assert.equal(pastedFiles("README.md", directory), undefined);
});

for (const method of ["clipboard", "terminal"]) {
  test(`${method} large paste folds in both editor and transcript with full content delivered`, () => {
    const { editor, state, views } = fixture();
    editor.setText("Analyze this:\n");
    if (method === "clipboard") editor.insertTextAtCursor(large);
    else editor.handleInput(bracketed(large));
    editor.insertTextAtCursor("\nExplain the cause.");
    const full = `Analyze this:\n${large}\nExplain the cause.`;
    assert.match(editor.getText(), /\[paste #\d+ \+20 lines\]/);
    assert.equal(editor.getExpandedText(), full);
    editor.handleInput("\r");
    assert.deepEqual(state.submitted, [full]);
    const display = views.render(full);
    assert.ok(display.includes("Analyze this:") && display.includes("Explain the cause."));
    assert.ok(!display.includes("log line 0"));
    assert.match(display, /\+20 lines/);
  });
}

for (const [text, folded] of [["x".repeat(1000), false], ["x".repeat(1001), true], [Array(10).fill("x").join("\n"), false], [Array(11).fill("x").join("\n"), true]]) {
  test(`native threshold: ${text.length} chars/${text.split("\n").length} lines`, () => {
    const { editor } = fixture();
    editor.insertTextAtCursor(text);
    assert.equal(editor.getText().startsWith("[paste #"), folded);
    assert.equal(editor.getExpandedText(), text);
  });
}

for (const content of [image, file, large]) {
  test(`Tab preserves actual ${content === large ? "large text" : "attachment"} in the native follow-up queue`, () => {
    const { editor, state } = fixture();
    editor.insertTextAtCursor(content);
    editor.handleInput("\t");
    assert.deepEqual(state.queued, [content]);
    assert.deepEqual(state.submitted, []);
  });
}

test("mixed image/text draft retains newline, surrounding instructions and full payload", () => {
  const { editor, state } = fixture();
  editor.insertTextAtCursor(image);
  editor.handleInput("\x1b[13;3u");
  editor.insertTextAtCursor(large);
  editor.insertTextAtCursor("\nCompare these.");
  editor.handleInput("\r");
  assert.deepEqual(state.submitted, [`${image}\n${large}\nCompare these.`]);
});

test("split bracketed paste cannot interpret pasted Tab or Enter as queue/submit", () => {
  const { editor, state } = fixture();
  editor.handleInput("\x1b[200~first");
  editor.handleInput("\t");
  editor.handleInput("\r");
  editor.handleInput("second\x1b[201~");
  assert.equal(editor.getExpandedText(), "first    \nsecond");
  assert.deepEqual(state.submitted, []);
  assert.deepEqual(state.queued, []);
});

test("attachments are atomic for cursor movement, deletion and undo", () => {
  const { editor } = fixture();
  editor.insertTextAtCursor(image);
  editor.handleInput("\x1b[D");
  assert.equal(editor.getCursor().col, 0);
  editor.handleInput("\x1b[3~");
  assert.equal(editor.getText(), "");
  editor.handleInput("\x1f");
  assert.equal(editor.getExpandedText(), image);
  editor.handleInput("\x05");
  editor.handleInput("\x7f");
  assert.equal(editor.getText(), "");
});

test("history recall restores compact labels and their full content", () => {
  const { editor, state } = fixture();
  editor.insertTextAtCursor(image);
  editor.handleInput("\t");
  assert.deepEqual(state.queued, [image]);
  editor.handleInput("\x1b[A");
  assert.match(editor.getText(), /\[Image #/);
  assert.equal(editor.getExpandedText(), image);
  editor.handleInput("\r");
  assert.deepEqual(state.submitted, [image]);
});

test("deleted attachments are not submitted", () => {
  const { editor, state } = fixture();
  editor.setText("Describe ");
  editor.insertTextAtCursor(image);
  editor.handleInput("\x7f");
  editor.handleInput("\r");
  assert.deepEqual(state.submitted, ["Describe"]);
});

test("placeholder-looking text inside a large paste stays literal", () => {
  const { editor } = fixture();
  editor.insertTextAtCursor(image);
  const label = editor.getText();
  const literal = `${large}\nLiteral ${label} and [paste #1]`;
  editor.insertTextAtCursor("\n");
  editor.insertTextAtCursor(literal);
  assert.equal(editor.getExpandedText(), `${image}\n${literal}`);
});

test("presentation metadata supports trimmed messages and contains no copied payload", () => {
  const { editor, views } = fixture();
  editor.insertTextAtCursor(` \n${large}\n `);
  editor.getExpandedText();
  const record = views.get(large);
  assert.ok(record);
  assert.ok(!JSON.stringify(record).includes("log line"));
  const restored = new Presentations();
  restored.restore(JSON.parse(JSON.stringify(record)));
  assert.equal(restored.render(large), views.render(large));
  assert.equal(restored.render(large + "changed"), large + "changed");
  const next = fixture(restored).editor;
  next.setText(large);
  assert.match(next.getText(), /\[paste #/);
  assert.equal(next.getExpandedText(), large);
});

test("releasing and rebuilding an editor preserves pending attachments across reload", () => {
  const { editor, views } = fixture();
  editor.insertTextAtCursor(image);
  editor.insertTextAtCursor("\n" + large);
  const expected = `${image}\n${large}`;
  const raw = editor.releaseDraft();
  assert.equal(raw, expected);
  assert.equal(editor.getText(), expected);
  const next = fixture(views).editor;
  next.setText(raw);
  assert.match(next.getText(), /\[Image #/);
  assert.equal(next.getExpandedText(), expected);
});

test("narrow editor rendering wraps chips without exposing paths or overflowing", () => {
  for (const width of [8, 20, 80]) {
    const { editor } = fixture();
    editor.insertTextAtCursor(file);
    editor.focused = true;
    const lines = editor.render(width);
    assert.ok(lines.every((line) => visibleWidth(line) <= width));
    assert.ok(!strip(lines.join("\n")).includes(directory));
    assert.equal(editor.getExpandedText(), file);
  }
});

test("the real user-message renderer folds presentation only, not the message source", () => {
  const { editor, views } = fixture();
  editor.insertTextAtCursor(large);
  const source = editor.getExpandedText();
  const component = new UserMessageComponent(source, getMarkdownTheme(), 1, [(text) => views.render(text)]);
  const rendered = strip(component.render(80).join("\n"));
  assert.match(rendered, /\+20 lines/);
  assert.ok(!rendered.includes("log line"));
  assert.equal(source, large);
});

test("unsupported native editor storage is left untouched", () => {
  const editor = { getText: () => "raw" };
  assert.equal(PasteStorage.install(editor, new Presentations()), undefined);
  assert.deepEqual(Object.keys(editor), ["getText"]);
});

test("invalid persisted presentation spans are ignored", () => {
  const views = new Presentations();
  views.restore(null);
  views.restore({ hash: "a".repeat(64), length: 10, folds: [{ start: 0, end: 11, label: "x", kind: "text" }] });
  assert.equal(views.render("plain"), "plain");
});

test("extension persists display metadata and inspection never sends or edits a prompt", async () => {
  const handlers = new Map(), commands = new Map(), entries = [];
  let transform, current, hostText = "";
  extension({
    on: (name, handler) => handlers.set(name, handler),
    registerMarkdownTransformer: (fn) => { transform = fn; },
    registerCommand: (name, command) => commands.set(name, command),
    appendEntry: (customType, data) => entries.push({ type: "custom", customType, data }),
  });
  const bindings = new KeybindingsManager(config);
  setKeybindings(bindings);
  const ctx = { mode: "tui", cwd: directory, isIdle: () => true,
    sessionManager: { getBranch: () => entries },
    ui: {
      setEditorComponent(factory) {
        hostText = current?.getText() ?? hostText;
        current = factory ? factory({ requestRender() {}, terminal: { rows: 40 } }, theme, bindings) : undefined;
        current?.setText(hostText);
      },
      setEditorText(text) { hostText = text; current?.setText(text); },
      notify() {},
      async select(_title, options) { return options[0]; },
      async editor(_title, text) { assert.equal(text, large); return "discarded edit"; },
    },
  };
  handlers.get("session_start")({}, ctx);
  current.insertTextAtCursor(large);
  const message = { role: "user", content: [{ type: "text", text: current.getExpandedText() }] };
  handlers.get("message_end")({ message }, ctx);
  assert.equal(entries[0].customType, PRESENTATION_ENTRY);
  assert.match(transform(large, { messageType: "user" }), /\+20 lines/);
  assert.equal(transform(large, { messageType: "assistant" }), large);
  await commands.get("paste-view").handler("", ctx);
  assert.equal(current.getExpandedText(), large);
  // Reproduce Pi /reload: UI reset copies compact getText() before shutdown.
  ctx.ui.setEditorComponent(undefined);
  assert.match(hostText, /\[paste #/);
  handlers.get("session_shutdown")({}, ctx);
  assert.equal(hostText, large);
  handlers.get("session_start")({}, ctx);
  assert.equal(current.getExpandedText(), large);
  assert.match(current.getText(), /\[paste #/);
  assert.match(transform(large, { messageType: "user" }), /\+20 lines/);
});
