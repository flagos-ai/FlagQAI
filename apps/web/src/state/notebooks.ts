import catalog from "../data/notebook-catalog.json" with { type: "json" };
export const notebookRevision = catalog.revision;
export const notebookExamples = catalog.entries;
export type NotebookExample = (typeof notebookExamples)[number];
export type NotebookCell = {
  cell_type: string;
  source: string | string[];
  outputs?: unknown[];
};
export type NotebookDocument = { nbformat: number; cells: NotebookCell[] };
export function notebookText(source: string | string[]) {
  return Array.isArray(source) ? source.join("") : source;
}
export function parseNotebook(value: unknown): NotebookDocument {
  const notebook = value as NotebookDocument;
  if (
    notebook?.nbformat !== 4 ||
    !Array.isArray(notebook.cells) ||
    notebook.cells.length > 1000
  )
    throw Error("Unsupported notebook format.");
  for (const cell of notebook.cells) {
    if (
      !cell || !["markdown", "code", "raw"].includes(cell.cell_type) ||
      !(
        typeof cell.source === "string" ||
        (Array.isArray(cell.source) &&
          cell.source.every((line) => typeof line === "string"))
      )
    )
      throw Error("Invalid notebook cell.");
  }
  return notebook;
}
export function matchingNotebooks(query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return notebookExamples.filter((item) =>
    terms.every((term) =>
      `${item.title} ${item.path} ${item.scope}`.toLowerCase().includes(term),
    ),
  );
}
export async function loadNotebook(
  item: NotebookExample,
  signal?: AbortSignal,
) {
  const response = await fetch(`/notebooks/${item.id}.ipynb`, { signal });
  if (!response.ok) throw Error("Cannot load this notebook. Try again.");
  const bytes = await response.arrayBuffer();
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  if (hash !== item.notebookSha256)
    throw Error("Notebook does not match the pinned source.");
  return parseNotebook(JSON.parse(new TextDecoder().decode(bytes)));
}
