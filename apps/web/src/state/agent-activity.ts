import type { SessionViewRow } from "../../../../packages/sdk/index.d.ts";
export type Tool = NonNullable<SessionViewRow["tool"]>;
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const word = (value: unknown) => (typeof value === "string" ? value : "");
// Process output is data: remove terminal controls before putting it in the DOM.
export function cleanToolOutput(value: string) {
  return value
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .split("\n")
    .map((line) =>
      line
        .replace(/\r$/, "")
        .split("\r")
        .at(-1)!
        .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "")
        .replace(/\t/g, "    "),
    )
    .join("\n");
}
export function activityDuration(ms: number | undefined) {
  if (ms === undefined || !Number.isFinite(ms)) return "";
  return ms < 1000
    ? `${Math.max(0, Math.round(ms))} ms`
    : `${(Math.max(0, ms) / 1000).toFixed(1)} s`;
}
export function toolPresentation(tool: Tool) {
  const view = object(tool.resultView ?? tool.callView),
    raw = tool.argsFull || tool.argsText || "";
  let args: Record<string, unknown> = {};
  try {
    args = object(JSON.parse(raw));
  } catch {
    /* Incomplete streamed arguments stay readable. */
  }
  const detail =
    word(view.title) ||
    word(args.command) ||
    word(args.file_path) ||
    word(args.path) ||
    word(args.file) ||
    word(args.pattern) ||
    word(args.query) ||
    raw;
  let body = tool.errorText || tool.resultFull || tool.resultText || "";
  if (!tool.errorText) {
    if (view.card === "terminal" && typeof view.output === "string")
      body = view.output;
    else if (Array.isArray(view.content))
      body = view.content.map((part) => word(object(part).text)).join("");
    else if (view.card === "search") {
      if (Array.isArray(view.paths)) body = view.paths.map(word).join("\n");
      else if (Array.isArray(view.files))
        body = view.files
          .map((file) => {
            const f = object(file);
            return (
              word(f.path) +
              "\n" +
              (Array.isArray(f.matches)
                ? f.matches
                    .map((m) => {
                      const match = object(m);
                      return `${match.lineNumber}: ${word(match.line)}`;
                    })
                    .join("\n")
                : "")
            );
          })
          .join("\n");
    } else if (view.card === "diff" && Array.isArray(view.diffs))
      body = view.diffs
        .map((file) => {
          const f = object(file);
          return (
            word(f.path) +
            "\n" +
            (typeof f.patch === "string"
              ? f.patch
              : word(f.oldText)
                  .split("\n")
                  .map((l) => "- " + l)
                  .join("\n") +
                "\n" +
                word(f.newText)
                  .split("\n")
                  .map((l) => "+ " + l)
                  .join("\n"))
          );
        })
        .join("\n");
  }
  const category =
    view.category === "mutate" ||
    /^(edit|write|multiedit|notebookedit)$/i.test(tool.name)
      ? "mutate"
      : view.category === "exec" ||
          /^(bash|bashpersistent|sh|shell|terminal|powershell)$/i.test(
            tool.name,
          )
        ? "exec"
        : "other";
  return {
    detail: cleanToolOutput(detail).replace(/\s+/g, " ").slice(0, 480),
    body: cleanToolOutput(body),
    category,
    diff: view.card === "diff",
    exit: typeof view.exitCode === "number" ? view.exitCode : undefined,
  };
}
export function previewOutput(text: string, live = false) {
  const lines = cleanToolOutput(text).trimEnd().split("\n");
  const limit = live ? 5 : 3;
  return {
    text: (live ? lines.slice(-limit) : lines.slice(0, limit)).join("\n"),
    omitted: Math.max(0, lines.length - limit),
  };
}
