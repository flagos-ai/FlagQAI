export type CommentEdit = { source: string; start: number; end: number };
/** Toggle line comments while mapping the existing caret/selection through each edit. */
export function toggleLineComments(
  source: string,
  start: number,
  end: number,
  language: "qasm" | "python",
): CommentEdit {
  start = Math.max(0, Math.min(source.length, start));
  end = Math.max(start, Math.min(source.length, end));
  const lineStart = (position: number) =>
    position === 0 ? 0 : source.lastIndexOf("\n", position - 1) + 1;
  const first = lineStart(start),
    last = lineStart(end > start && source[end - 1] === "\n" ? end - 1 : end);
  const marker = language === "python" ? "#" : "//";
  const lines: { position: number; text: string; indent: number }[] = [];
  for (let position = first; position <= last; ) {
    const boundary = source.indexOf("\n", position),
      finish = boundary < 0 ? source.length : boundary;
    const text = source.slice(position, finish).replace(/\r$/, "");
    lines.push({ position, text, indent: /^[\t ]*/.exec(text)![0].length });
    if (boundary < 0) break;
    position = boundary + 1;
  }
  const nonblank = lines.filter((line) => line.text.trim());
  const targets = nonblank.length ? nonblank : lines;
  const uncomment = targets.every((line) =>
    line.text.slice(line.indent).startsWith(marker),
  );
  const edits = targets.map((line) => {
    const position = line.position + line.indent;
    return {
      position,
      remove: uncomment
        ? marker.length + (source[position + marker.length] === " " ? 1 : 0)
        : 0,
      insert: uncomment ? "" : marker + " ",
    };
  });
  const pieces: string[] = [];
  let cursor = 0;
  for (const edit of edits) {
    pieces.push(source.slice(cursor, edit.position), edit.insert);
    cursor = edit.position + edit.remove;
  }
  pieces.push(source.slice(cursor));
  const result = pieces.join("");
  const map = (position: number) => {
    let delta = 0;
    for (const edit of edits) {
      if (position < edit.position) break;
      if (edit.remove && position <= edit.position + edit.remove)
        return edit.position + delta;
      delta += edit.insert.length - edit.remove;
    }
    return position + delta;
  };
  return { source: result, start: map(start), end: map(end) };
}
export function isCommentShortcut(event: {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  isComposing?: boolean;
}) {
  return (
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.isComposing &&
    (event.key === "/" || (!event.shiftKey && event.code === "Slash"))
  );
}
