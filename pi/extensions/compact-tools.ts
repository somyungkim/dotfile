import { keyText, type ExtensionAPI, type Theme, type ToolRenderers } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences, truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";

const COMPACT_TOOLS = new Set(["bash", "powershell", "read", "write", "edit", "grep", "find", "ls", "codemode"]);
type RenderContext = Parameters<NonNullable<ToolRenderers["renderCall"]>>[2];
type ViewOptions = {
  expanded: boolean;
  role: "call" | "result";
  padding: number;
  prefix: string;
  tail?: boolean;
  notice?: string;
};

/** Compact only the view. Native renderers still own syntax, diffs and output. */
export class CompactToolView implements Component {
  constructor(readonly inner: Component, private options: ViewOptions, private theme: Theme) {}

  invalidate(): void { this.inner.invalidate(); }

  render(width: number): string[] {
    if (width < 1) return [];
    const { expanded, role, prefix, notice } = this.options;
    const padding = Math.min(this.options.padding, Math.max(0, Math.floor((width - 1) / 2)));
    const available = Math.max(1, width - padding * 2);
    const prefixWidth = Math.min(visibleWidth(prefix), Math.max(0, available - 1));
    const bodyWidth = Math.max(1, available - prefixWidth);
    let lines = this.inner.render(bodyWidth);
    // Remove framing whitespace, not blank lines inside code or command output.
    let start = 0, end = lines.length;
    while (start < end && !stripTerminalSequences(lines[start]).trim()) start++;
    while (end > start && !stripTerminalSequences(lines[end - 1]).trim()) end--;
    lines = lines.slice(start, end);
    if (!lines.length && !notice) return [];
    const limit = role === "call" ? 1 : 3;
    const clipped = !expanded && lines.length > limit;
    if (clipped) lines = this.options.tail ? lines.slice(-limit) : lines.slice(0, limit);
    const expandKey = keyText("app.tools.expand");
    if (clipped && role === "call") {
      const hint = this.theme.fg("muted", ` … (${expandKey})`);
      lines[0] = truncateToWidth(lines[0], Math.max(0, bodyWidth - visibleWidth(hint)), "") + hint;
    } else if (clipped) {
      lines.push(this.theme.fg("muted", `… more output (${expandKey} to expand)`));
    }
    if (notice && !expanded) lines.push(this.theme.fg("warning", notice));
    const left = " ".repeat(padding);
    return lines.map((line, index) => truncateToWidth(
      left + (index === 0 ? prefix : " ".repeat(prefixWidth)) + line,
      width,
    ));
  }
}

function nativeContext(context: RenderContext): RenderContext {
  return {
    ...context,
    outputPad: 0,
    lastComponent: context.lastComponent instanceof CompactToolView ? context.lastComponent.inner : context.lastComponent,
  };
}

function status(context: RenderContext, theme: Theme): string {
  if (context.isError) return theme.fg("error", "! failed · ");
  if (!context.isPartial) return theme.fg("success", "✓ ");
  return context.executionStarted ? theme.fg("warning", "… ") : theme.fg("muted", "· ");
}

export function compactRenderers(name: string, native: ToolRenderers | undefined): ToolRenderers | undefined {
  // Keep plugin-specific interfaces (Datadog charts, questionnaires, etc.) intact.
  if (!COMPACT_TOOLS.has(name) || !native?.renderCall || !native.renderResult) return native;
  const renderCall = native.renderCall, renderResult = native.renderResult;
  return {
    ...native,
    renderShell: "self",
    renderCall(args, theme, context) {
      return new CompactToolView(renderCall(args, theme, nativeContext(context)), {
        expanded: context.expanded, role: "call", padding: context.outputPad,
        prefix: status(context, theme),
      }, theme);
    },
    renderResult(result, options, theme, context) {
      const details = result.details as {
        truncation?: { truncated?: boolean }; fullOutputPath?: string;
        calls?: { status?: string }[];
      } | undefined;
      const notices: string[] = [];
      if (details?.truncation?.truncated) notices.push("Output truncated");
      else if (details?.fullOutputPath) notices.push("Full output saved");
      const failures = details?.calls?.filter((call) => call.status === "error" || call.status === "cancelled").length ?? 0;
      if (failures) notices.push(`${failures} nested tool call(s) failed or cancelled`);
      if (notices.length) notices.push(`${keyText("app.tools.expand")} for details`);
      return new CompactToolView(renderResult(result, options, theme, nativeContext(context)), {
        expanded: options.expanded, role: "result", padding: context.outputPad,
        prefix: "  ", tail: name === "bash" || name === "powershell",
        notice: notices.join(" · "),
      }, theme);
    },
  };
}

export default function (pi: ExtensionAPI) {
  // Rendering only: never replace tool implementations, schemas or permissions.
  pi.registerToolRenderer((name, next) => compactRenderers(name, next()));
}
