import snapshot from "../data/synthesis-files.json" with { type: "json" };
import type { Model } from "../contracts/quantum-workspace";

export type SynthesisFile = {
  path: string;
  sha256: string;
  bytes: number;
  url: string;
  notebookId?: string;
};
export const synthesisFiles: SynthesisFile[] = snapshot.entries;
export const synthesisFilesRevision = snapshot.revision;
export type SourceFolder = {
  name: string;
  path: string;
  folders: SourceFolder[];
  files: SynthesisFile[];
};
export function sourceTree(query = ""): SourceFolder {
  const root: SourceFolder = {
    name: "synthesis",
    path: "",
    folders: [],
    files: [],
  };
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  for (const file of synthesisFiles) {
    if (!terms.every((term) => file.path.toLowerCase().includes(term)))
      continue;
    let node = root;
    const parts = file.path.split("/");
    for (const name of parts.slice(0, -1)) {
      const path = node.path ? `${node.path}/${name}` : name;
      let child = node.folders.find((folder) => folder.name === name);
      if (!child) {
        child = { name, path, folders: [], files: [] };
        node.folders.push(child);
      }
      node = child;
    }
    node.files.push(file);
  }
  return root;
}
export async function loadSynthesisFile(
  file: SynthesisFile,
  signal?: AbortSignal,
) {
  const response = await fetch(file.url, { signal });
  if (!response.ok) throw Error("Cannot open the source file. Try again.");
  const bytes = await response.arrayBuffer();
  const digest = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (value) => value.toString(16).padStart(2, "0"),
  ).join("");
  if (digest !== file.sha256)
    throw Error(
      "The file differs from the repository snapshot. Reload before opening it.",
    );
  return new TextDecoder().decode(bytes);
}
export function synthesisFileModel(file: SynthesisFile, source: string): Model {
  return { name: file.path, source, language: "python" };
}
