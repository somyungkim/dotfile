import {
  CustomEditor,
  type KeybindingsManager,
} from "@earendil-works/pi-coding-agent";
import { Editor, matchesKey, type EditorTheme, type TUI } from "@earendil-works/pi-tui";

/** Keep Tab completion available even though Tab is also Pi's follow-up shortcut. */
export class QueueEditor extends CustomEditor {
  constructor(
    tui: TUI,
    theme: EditorTheme,
    private readonly bindings: KeybindingsManager,
    private readonly isIdle: () => boolean,
  ) {
    super(tui, theme, bindings);
  }

  protected isCompletionContext(): boolean {
    if (this.isShowingAutocomplete()) return true;

    // Protect commands and explicit paths even before asynchronous suggestions appear.
    // While working, use @file or ./file for completion of an otherwise bare filename.
    const { line, col } = this.getCursor();
    const beforeCursor = this.getLines()[line].slice(0, col);
    const token = (beforeCursor.match(/\S+$/)?.[0] ?? "").replace(/^["'`([{]+/, "");
    return this.getText().trimStart().startsWith("/") || /^[@#.~]/.test(token) || token.includes("/");
  }

  handleInput(data: string): void {
    if (
      matchesKey(data, "tab") &&
      this.bindings.matches(data, "app.message.followUp") &&
      (this.isIdle() || !this.getText().trim() || this.isCompletionContext())
    ) {
      if (this.onExtensionShortcut?.(data)) return;
      // CustomEditor checks app actions before completion. Bypass only that dispatch
      // for this Tab; retain the native editor's completion and paste handling.
      Editor.prototype.handleInput.call(this, data);
      return;
    }

    // Busy prose + Tab uses Pi's native follow-up handler, including history,
    // paste expansion and queue UI. Enter and every other key remain unchanged.
    super.handleInput(data);
  }
}
