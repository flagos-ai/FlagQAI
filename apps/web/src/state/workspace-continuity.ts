export type EditorPosition = {
  start: number;
  end: number;
  direction: "forward" | "backward" | "none";
  top: number;
  left: number;
};
const number = (value: unknown, max: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(0, Math.floor(value)))
    : 0;
const coordinate = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(10_000_000, Math.max(0, value))
    : 0;
export function editorPosition(
  value: Partial<EditorPosition> = {},
  length = 1_000_000,
): EditorPosition {
  const start = number(value.start, length);
  return {
    start,
    end: Math.max(start, number(value.end, length)),
    direction:
      value.direction === "backward" || value.direction === "forward"
        ? value.direction
        : "none",
    top: coordinate(value.top),
    left: coordinate(value.left),
  };
}
export function readPositions(
  storage: Pick<Storage, "getItem">,
): Record<string, EditorPosition> {
  try {
    const value = JSON.parse(storage.getItem("fq-editor-positions-v1") || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key, position]) =>
            key.length <= 600 && position && typeof position === "object",
        )
        .slice(-96)
        .map(([key, position]) => [
          key,
          editorPosition(position as EditorPosition),
        ]),
    );
  } catch {
    return {};
  }
}
export function rememberPosition(
  positions: Record<string, EditorPosition>,
  key: string,
  position: EditorPosition,
) {
  return Object.fromEntries(
    [
      ...Object.entries(positions).filter(([id]) => id !== key),
      [key, editorPosition(position)],
    ].slice(-96),
  );
}
export function readFolders(
  storage: Pick<Storage, "getItem">,
): Record<string, string[]> {
  try {
    const value = JSON.parse(storage.getItem("fq-project-folders-v1") || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key, paths]) => /^[a-f0-9]{32}$/.test(key) && Array.isArray(paths),
        )
        .slice(-32)
        .map(([key, paths]) => [
          key,
          (paths as unknown[])
            .filter(
              (path): path is string =>
                typeof path === "string" &&
                path.length <= 240 &&
                !path.split("/").some((part) => !part || part.startsWith(".")),
            )
            .slice(0, 128),
        ]),
    );
  } catch {
    return {};
  }
}
export function workspaceShortcut(event: {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  isComposing?: boolean;
}): "find" | "run" | undefined {
  if (
    !(event.metaKey || event.ctrlKey) ||
    event.altKey ||
    event.shiftKey ||
    event.isComposing
  )
    return;
  if (event.key.toLowerCase() === "p") return "find";
  if (event.key === "Enter") return "run";
}

export function findProjectFiles<T extends { path: string }>(
  files: T[],
  query: string,
  activePath?: string,
): T[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const rank = (path: string) => {
    if (!terms.length) return path === activePath ? -1 : 0;
    const name = path.split("/").at(-1)!.toLowerCase();
    return name === terms.join(" ") ? 0 : name.startsWith(terms[0]) ? 1 : 2;
  };
  return files
    .filter((file) =>
      terms.every((term) => file.path.toLowerCase().includes(term)),
    )
    .sort(
      (a, b) => rank(a.path) - rank(b.path) || a.path.localeCompare(b.path),
    );
}
