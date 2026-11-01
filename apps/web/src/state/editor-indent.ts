/** Indent whole selected lines; a plain caret inserts spaces without losing text. */
export function indentSelection(
  source: string,
  start: number,
  end: number,
  dedent = false,
): { source: string; start: number; end: number } {
  start = Math.max(0, Math.min(source.length, start));
  end = Math.max(start, Math.min(source.length, end));
  if (!dedent && start === end)
    return {
      source: source.slice(0, start) + "    " + source.slice(end),
      start: start + 4,
      end: end + 4,
    };
  const lineStart = (position: number) =>
    position === 0 ? 0 : source.lastIndexOf("\n", position - 1) + 1;
  const first = lineStart(start);
  const last = lineStart(
    end > start && source[end - 1] === "\n" ? end - 1 : end,
  );
  const edits: { position: number; remove: number; insert: string }[] = [];
  for (let position = first; position <= last; ) {
    const remove = dedent
      ? (/^(?:\t| {1,4})/.exec(source.slice(position))?.[0].length ?? 0)
      : 0;
    if (!dedent || remove)
      edits.push({ position, remove, insert: dedent ? "" : "    " });
    const boundary = source.indexOf("\n", position);
    if (boundary < 0) break;
    position = boundary + 1;
  }
  let cursor = 0;
  const pieces: string[] = [];
  for (const edit of edits) {
    pieces.push(source.slice(cursor, edit.position), edit.insert);
    cursor = edit.position + edit.remove;
  }
  pieces.push(source.slice(cursor));
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
  return { source: pieces.join(""), start: map(start), end: map(end) };
}

export function isIndentShortcut(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  isComposing?: boolean;
}) {
  return (
    event.key === "Tab" &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.isComposing
  );
}
