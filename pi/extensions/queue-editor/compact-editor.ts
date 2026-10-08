import { statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, extname, isAbsolute, resolve } from "node:path";
import type { KeybindingsManager } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, type EditorTheme, type TUI } from "@earendil-works/pi-tui";
import { QueueEditor } from "./editor.ts";
import { PasteStorage } from "./paste-storage.ts";
import { Presentations } from "./presentations.ts";

const START = "\x1b[200~", END = "\x1b[201~";
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".heic", ".tif", ".tiff"]);
export const isLargePaste = (text: string) => text.length > 1000 || text.split("\n").length > 10;

type PastedFile = { start: number; end: number; path: string; kind: "file" | "image" };
/** Only compact a paste made entirely of existing, explicit file paths. */
export function pastedFiles(text: string, cwd: string): PastedFile[] | undefined {
  const files: PastedFile[] = [];
  let offset = 0;
  for (const line of text.split("\n")) {
    const raw = line.trim();
    if (raw) {
      let path = raw;
      if ((path.startsWith('"') && path.endsWith('"')) || (path.startsWith("'") && path.endsWith("'"))) path = path.slice(1, -1);
      else path = path.replace(/\\([ ()\[\]'"\\])/g, "$1");
      if (/[\p{Cc}]/u.test(path) || (!isAbsolute(path) && !/^(~\/|\.\.?\/)/.test(path))) return;
      path = path.startsWith("~/") ? resolve(homedir(), path.slice(2)) : resolve(cwd, path);
      try { if (!statSync(path).isFile()) return; } catch { return; }
      const start = offset + line.indexOf(raw);
      files.push({ start, end: start + raw.length, path, kind: IMAGE_EXTENSIONS.has(extname(path).toLowerCase()) ? "image" : "file" });
    }
    offset += line.length + 1;
  }
  return files.length ? files : undefined;
}

export class CompactEditor extends QueueEditor {
  private storage?: PasteStorage;
  private bracketedPaste: string | undefined;

  constructor(
    tui: TUI, theme: EditorTheme, private compactBindings: KeybindingsManager,
    isIdle: () => boolean, private cwd: string, private views: Presentations,
  ) {
    super(tui, theme, compactBindings, isIdle);
    this.storage = PasteStorage.install(this, views);
  }

  get supportsAttachments(): boolean { return this.storage !== undefined; }

  protected override isCompletionContext(): boolean {
    const { line, col } = this.getCursor();
    if (!this.isShowingAutocomplete() && !this.getText().trimStart().startsWith("/") &&
        this.storage?.endsWithToken(this.getLines()[line].slice(0, col))) return false;
    return super.isCompletionContext();
  }

  private insertFiles(text: string): boolean {
    // Do not replace shell arguments with UI tokens or change shell quoting.
    if (!this.storage || this.getText().trimStart().startsWith("!")) return false;
    const files = pastedFiles(text, this.cwd);
    if (!files) return false;
    let compact = "", cursor = 0;
    for (const file of files) {
      const name = truncateToWidth(basename(file.path).replace(/[\p{Cc}\p{Cf}]/gu, "_"), 60);
      compact += text.slice(cursor, file.start) + this.storage.register(
        text.slice(file.start, file.end), file.kind,
        file.kind === "file" ? (id) => `[File #${id}: ${name}]` : undefined,
      );
      cursor = file.end;
    }
    super.insertTextAtCursor(compact + text.slice(cursor));
    return true;
  }

  override insertTextAtCursor(text: string): void {
    this.storage?.prepare();
    if (this.insertFiles(text)) return;
    // Ctrl+V's text fallback normally bypasses Pi's native large-paste handler.
    if (isLargePaste(text)) this.handleInput(START + text + END);
    else super.insertTextAtCursor(text);
  }

  override handleInput(data: string): void {
    this.storage?.prepare();
    // Buffer a whole bracketed paste before interpreting keys. A pasted Tab must
    // never queue the draft, including when the terminal splits paste events.
    if (this.bracketedPaste !== undefined) {
      this.bracketedPaste += data;
      const end = this.bracketedPaste.indexOf(END);
      if (end < 0) return;
      const text = this.bracketedPaste.slice(0, end);
      const rest = this.bracketedPaste.slice(end + END.length);
      this.bracketedPaste = undefined;
      if (!this.insertFiles(text)) super.handleInput(START + text + END);
      if (rest) this.handleInput(rest);
      return;
    }
    const start = data.indexOf(START);
    if (start >= 0) {
      if (start) super.handleInput(data.slice(0, start));
      this.bracketedPaste = "";
      this.handleInput(data.slice(start + START.length));
      return;
    }
    super.handleInput(data);
    if ((["tui.editor.cursorUp", "tui.editor.cursorDown", "tui.editor.historyPrevious", "tui.editor.historyNext"] as const)
      .some((key) => this.compactBindings.matches(data, key))) {
      const text = this.getText();
      if (this.views.get(text)) this.setText(text);
    }
  }

  override setText(text: string): void {
    const record = this.views?.get(text);
    if (!record || !this.storage) { super.setText(text); return; }
    super.setText("");
    let compact = "", cursor = 0;
    for (const fold of record.folds) {
      compact += text.slice(cursor, fold.start) + this.storage.register(
        text.slice(fold.start, fold.end), fold.kind, fold.label,
      );
      cursor = fold.end;
    }
    super.insertTextAtCursor(compact + text.slice(cursor));
  }

  /** Pi transfers getText() when replacing editors, so release real content first. */
  releaseDraft(): string {
    const expanded = this.getExpandedText();
    super.setText(expanded);
    return expanded;
  }
}
