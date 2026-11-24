import { notebookRevision, type NotebookExample } from "./notebooks.ts";
export type SDKCall = { api: string; line: number };
export type NotebookImplementation = {
  files: Record<string, string>;
  calls: Record<string, SDKCall[]>;
};
const hash = async (bytes: ArrayBuffer) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
export async function loadImplementation(
  item: NotebookExample,
  signal?: AbortSignal,
): Promise<NotebookImplementation> {
  const [bundleResponse, indexResponse] = await Promise.all([
    fetch(`/notebooks/${item.id}.json`, { signal }),
    fetch("/notebooks/implementation-index.json", { signal }),
  ]);
  if (!bundleResponse.ok || !indexResponse.ok)
    throw Error(
      "Cannot load companion implementation. Retry to read the pinned sources.",
    );
  const bytes = await bundleResponse.arrayBuffer();
  if ((await hash(bytes)) !== item.bundleSha256)
    throw Error("Companion source does not match the pinned revision.");
  const bundle = JSON.parse(new TextDecoder().decode(bytes));
  const index = await indexResponse.json();
  const entry = index.entries?.[item.id];
  if (
    bundle.id !== item.id ||
    bundle.revision !== notebookRevision ||
    index.revision !== notebookRevision ||
    entry?.bundleSha256 !== item.bundleSha256
  )
    throw Error("Implementation index does not match the pinned sources.");
  return { files: bundle.files, calls: entry.files };
}

/** Only imports of companion examples are links; external modules stay external. */
export function importedSources(
  source: string,
  files: Record<string, string>,
): string[] {
  const paths = new Set<string>();
  for (const match of source.matchAll(
    /^\s*(?:from\s+(examples[\w.]*)\s+import\s+([^\n]+)|import\s+(examples[\w.]*))/gm,
  )) {
    const module = (match[1] || match[3]).replaceAll(".", "/");
    if (files[module + ".py"] !== undefined) paths.add(module + ".py");
    for (const name of (match[2] || "").replace(/[()]/g, "").split(",")) {
      const child = module + "/" + name.trim().split(/\s/)[0] + ".py";
      if (files[child] !== undefined) paths.add(child);
    }
  }
  return [...paths];
}
export function implementationRole(path: string): string {
  const file = path.split("/").at(-1);
  return file === "model.py"
    ? "Problem and data"
    : file === "quantum.py"
      ? "Quantum construction"
      : file === "workflow.py"
        ? "Execution and evaluation"
        : file === "main.py"
          ? "Entry and reporting"
          : "Companion implementation";
}
