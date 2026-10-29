export type DiffRow = {
  kind: "equal" | "added" | "removed";
  text: string;
  oldLine: number | null;
  newLine: number | null;
};
/** Exact line diff, with a bounded LCS core for large rewritten files. */
export function lineDiff(before: string, after: string): DiffRow[] {
  const oldLines = before.split("\n"),
    newLines = after.split("\n");
  let prefix = 0,
    suffix = 0;
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  )
    prefix++;
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] ===
      newLines[newLines.length - 1 - suffix]
  )
    suffix++;
  const rows: DiffRow[] = [];
  let oldLine = 1,
    newLine = 1;
  const add = (kind: DiffRow["kind"], text: string) =>
    rows.push({
      kind,
      text,
      oldLine: kind === "added" ? null : oldLine++,
      newLine: kind === "removed" ? null : newLine++,
    });
  for (let i = 0; i < prefix; i++) add("equal", oldLines[i]);
  const a = oldLines.slice(prefix, oldLines.length - suffix),
    b = newLines.slice(prefix, newLines.length - suffix);
  if ((a.length + 1) * (b.length + 1) <= 1_000_000) {
    const width = b.length + 1,
      table = new Uint32Array((a.length + 1) * width);
    for (let i = a.length - 1; i >= 0; i--)
      for (let j = b.length - 1; j >= 0; j--)
        table[i * width + j] =
          a[i] === b[j]
            ? 1 + table[(i + 1) * width + j + 1]
            : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    let i = 0,
      j = 0;
    while (i < a.length || j < b.length) {
      if (i < a.length && j < b.length && a[i] === b[j]) {
        add("equal", a[i++]);
        j++;
      } else if (
        i < a.length &&
        (j === b.length ||
          table[(i + 1) * width + j] >= table[i * width + j + 1])
      )
        add("removed", a[i++]);
      else add("added", b[j++]);
    }
  } else {
    a.forEach((text) => add("removed", text));
    b.forEach((text) => add("added", text));
  }
  for (let i = oldLines.length - suffix; i < oldLines.length; i++)
    add("equal", oldLines[i]);
  return rows;
}
export function changedLines(before: string, after: string) {
  const added = new Set<number>(),
    removedAt = new Set<number>(),
    lineCount = after.split("\n").length;
  let next = 1;
  for (const row of lineDiff(before, after)) {
    if (row.kind === "removed") removedAt.add(Math.min(next, lineCount));
    else {
      if (row.kind === "added") added.add(row.newLine!);
      next = row.newLine! + 1;
    }
  }
  return { added, removedAt };
}
export async function sourceRevision(source: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(source),
  );
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
