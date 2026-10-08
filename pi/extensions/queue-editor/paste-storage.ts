import type { CustomEditor } from "@earendil-works/pi-coding-agent";
import { type Fold, Presentations } from "./presentations.ts";

// Pi 1.1's editor exposes no generic attachment API. Keep the compatibility
// boundary here, use its existing storage/undo machinery, and fall back to raw
// text if its shape changes. Never patch Pi's files or global prototypes.
interface NativePasteStorage {
  pastes: Map<number, string>;
  pasteCounter: number;
  segment(text: string, granularity: "grapheme" | "word"): Intl.SegmentData[];
  expandPasteMarkers(text: string): string;
}
type Alias = { content: string; label: string; kind: "image" | "file" };
type Token = Fold & { content: string };

export class PasteStorage {
  private aliases = new Map<number, Alias>();
  private highWater = 0;

  static install(editor: CustomEditor, views: Presentations): PasteStorage | undefined {
    const native = editor as unknown as NativePasteStorage;
    if (!(native.pastes instanceof Map) || !Number.isSafeInteger(native.pasteCounter) ||
        typeof native.segment !== "function" || typeof native.expandPasteMarkers !== "function") return;
    return new PasteStorage(native, views);
  }

  private constructor(private native: NativePasteStorage, private views: Presentations) {
    const segment = native.segment.bind(native);
    native.segment = (text, granularity) => {
      const parts = segment(text, granularity);
      const aliases = this.tokens(text).filter((token) => token.kind !== "text");
      if (!aliases.length) return parts;
      const result: Intl.SegmentData[] = [];
      for (const part of parts) {
        const alias = aliases.find((token) => part.index >= token.start && part.index < token.end);
        if (!alias) result.push(part);
        else if (part.index === alias.start) result.push({
          ...part, segment: text.slice(alias.start, alias.end),
        });
      }
      return result;
    };
    native.expandPasteMarkers = (text) => {
      let expanded = "", cursor = 0;
      const folds: Fold[] = [];
      // Expand once, so placeholder-looking text INSIDE a paste remains literal.
      for (const token of this.tokens(text)) {
        expanded += text.slice(cursor, token.start);
        const start = expanded.length;
        expanded += token.content;
        folds.push({ start, end: expanded.length, label: token.label, kind: token.kind });
        cursor = token.end;
      }
      expanded += text.slice(cursor);
      views.remember(expanded, folds);
      return expanded;
    };
  }

  prepare(): void {
    this.highWater = Math.max(this.highWater, this.native.pasteCounter);
    // Pi resets its counter on submit/setText. Do not reuse attachment IDs while
    // older undo snapshots can still restore their backing data.
    this.native.pasteCounter = this.highWater;
  }

  register(content: string, kind: Fold["kind"], label?: string | ((id: number) => string)): string {
    this.prepare();
    const id = ++this.native.pasteCounter;
    this.highWater = id;
    this.native.pastes.set(id, content);
    if (kind === "text") {
      const lines = content.split("\n").length;
      return lines > 10 ? `[paste #${id} +${lines} lines]` : `[paste #${id} ${content.length} chars]`;
    }
    const token = typeof label === "function" ? label(id) : label ?? `[Image #${id}]`;
    this.aliases.set(id, { content, kind, label: token });
    return token;
  }

  endsWithToken(text: string): boolean {
    return this.tokens(text).some((token) => token.end === text.length);
  }

  private tokens(text: string): Token[] {
    const found: Token[] = [];
    for (const match of text.matchAll(/\[paste #(\d+)( (\+\d+ lines|\d+ chars))?\]/g)) {
      const content = this.native.pastes.get(Number(match[1]));
      if (content !== undefined) found.push({
        start: match.index, end: match.index + match[0].length,
        content, label: match[0], kind: "text",
      });
    }
    for (const [id, alias] of this.aliases) {
      if (this.native.pastes.get(id) !== alias.content) continue;
      let start = text.indexOf(alias.label);
      while (start >= 0) {
        found.push({ start, end: start + alias.label.length, ...alias });
        start = text.indexOf(alias.label, start + alias.label.length);
      }
    }
    let end = 0;
    return found.sort((a, b) => a.start - b.start || b.end - a.end).filter((token) => {
      if (token.start < end) return false;
      end = token.end;
      return true;
    });
  }
}
