import { createHash } from "node:crypto";

export type Fold = {
  start: number;
  end: number;
  label: string;
  kind: "text" | "image" | "file";
};
export type Presentation = { hash: string; length: number; folds: Fold[] };
export const PRESENTATION_ENTRY = "compact-paste-presentation-v1";
const hash = (text: string) => createHash("sha256").update(text).digest("hex");

/** Display metadata only. The original content remains in Pi's normal messages. */
export class Presentations {
  private records = new Map<string, Presentation>();

  remember(text: string, folds: Fold[]): void {
    if (!folds.length) return;
    this.records.set(hash(text), { hash: hash(text), length: text.length, folds });
    // Pi trims both ordinary submissions and queued follow-ups.
    const trimmed = text.trim();
    if (trimmed !== text) {
      const offset = text.length - text.trimStart().length;
      const adjusted = folds.map((fold) => ({
        ...fold,
        start: Math.max(0, fold.start - offset),
        end: Math.min(trimmed.length, fold.end - offset),
      })).filter((fold) => fold.end > fold.start);
      if (adjusted.length) this.records.set(hash(trimmed), {
        hash: hash(trimmed), length: trimmed.length, folds: adjusted,
      });
    }
  }

  restore(data: unknown): void {
    if (!data || typeof data !== "object") return;
    const record = data as Presentation;
    if (!/^[a-f0-9]{64}$/.test(record.hash) || !Number.isSafeInteger(record.length) || record.length < 0 || !Array.isArray(record.folds)) return;
    let end = 0;
    for (const fold of record.folds) {
      if (!fold || !Number.isSafeInteger(fold.start) || !Number.isSafeInteger(fold.end) ||
          fold.start < end || fold.end <= fold.start || fold.end > record.length ||
          !["text", "image", "file"].includes(fold.kind) || typeof fold.label !== "string" ||
          fold.label.length > 256 || /[\r\n\x00-\x1f\x7f]/.test(fold.label)) return;
      end = fold.end;
    }
    this.records.set(record.hash, record);
  }

  get(text: string): Presentation | undefined {
    const record = this.records.get(hash(text));
    return record?.length === text.length ? record : undefined;
  }

  render(text: string): string {
    const record = this.get(text);
    if (!record) return text;
    let result = "", cursor = 0;
    for (const fold of record.folds) {
      // Code spans keep filenames containing Markdown punctuation literal.
      const fence = "`".repeat(Math.max(0, ...(fold.label.match(/`+/g) ?? []).map((s) => s.length)) + 1);
      result += text.slice(cursor, fold.start) + `${fence} ${fold.label} ${fence}`;
      cursor = fold.end;
    }
    return result + text.slice(cursor);
  }
}

export function messageText(message: { content?: unknown }): string {
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.content)) return "";
  return message.content.filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text).join("\n");
}
