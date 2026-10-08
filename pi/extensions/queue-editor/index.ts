import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { CompactEditor } from "./compact-editor.ts";
import { messageText, PRESENTATION_ENTRY, Presentations } from "./presentations.ts";
export { QueueEditor } from "./editor.ts";
export { CompactEditor } from "./compact-editor.ts";

export default function (pi: ExtensionAPI) {
  let views = new Presentations();
  let saved = new Set<string>();
  let editor: CompactEditor | undefined;

  const save = (text: string) => {
    const record = views.get(text);
    if (record && !saved.has(record.hash)) {
      pi.appendEntry(PRESENTATION_ENTRY, record);
      saved.add(record.hash);
    }
  };

  // This hook changes only TUI Markdown. Model context, exports and the normal
  // session messages retain the full content and original paths.
  pi.registerMarkdownTransformer((text, ctx) => ctx.messageType === "user" ? views.render(text) : text);

  pi.on("session_start", (_event, ctx) => {
    views = new Presentations();
    saved = new Set();
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type === "custom" && entry.customType === PRESENTATION_ENTRY) views.restore(entry.data);
    }
    if (ctx.mode !== "tui") return;
    ctx.ui.setEditorComponent((tui, theme, bindings) => {
      editor = new CompactEditor(tui, theme, bindings, () => ctx.isIdle(), ctx.cwd, views);
      return editor;
    });
    if (editor && !editor.supportsAttachments) {
      ctx.ui.notify("Compact attachments are unavailable with this Pi editor version; full pasted paths remain visible.", "warning");
    }
  });

  pi.on("message_end", (event) => {
    if (event.message.role === "user") save(messageText(event.message));
  });

  pi.on("session_shutdown", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    const draft = editor?.releaseDraft();
    if (draft !== undefined) save(draft);
    ctx.ui.setEditorComponent(undefined);
    // /reload resets extension UI before session_shutdown, so the host may
    // already have copied the compact text into its default editor.
    if (draft !== undefined) ctx.ui.setEditorText(draft);
    editor = undefined;
  });

  pi.registerCommand("paste-view", {
    description: "Inspect the full draft or a folded user message without sending or changing it",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui") return;
      const choices: { label: string; text: string }[] = [];
      const draft = editor?.getExpandedText();
      if (draft) choices.push({ label: "Current draft", text: draft });
      for (const entry of ctx.sessionManager.getBranch()) {
        if (entry.type !== "message" || entry.message.role !== "user") continue;
        const text = messageText(entry.message);
        if (views.get(text)) choices.push({
          label: `Message ${choices.length + 1}: ${views.render(text).replace(/[\r\n`]/g, " ").slice(0, 80)}`,
          text,
        });
      }
      if (!choices.length) { ctx.ui.notify("No draft or folded messages to inspect.", "info"); return; }
      const selected = await ctx.ui.select("Inspect full content", choices.map((choice) => choice.label));
      const choice = choices.find((item) => item.label === selected);
      if (choice) {
        // The editor dialog supports scrolling/copying; deliberately discard its
        // return value so inspecting cannot edit history or send a prompt.
        await ctx.ui.editor("Full prompt (view only; changes discarded)", choice.text);
      }
    },
  });
}
