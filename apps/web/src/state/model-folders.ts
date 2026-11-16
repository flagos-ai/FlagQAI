import type { Model } from "../contracts/quantum-workspace";

export const defaultModelFolders = [
  "Saved models",
  "Drafts",
  "Agent snapshots",
];
export function normalizeModelFolder(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 240) return null;
  const parts = value
    .trim()
    .split("/")
    .map((part) => part.trim());
  if (
    parts.length > 8 ||
    parts.some(
      (part) =>
        !part || part === "." || part === ".." || /[\\\x00-\x1f]/.test(part),
    )
  )
    return null;
  return parts.join("/");
}
export function modelFolder(model: Model): string {
  return (
    normalizeModelFolder(model.folder) ||
    (model.name.startsWith("Draft · ")
      ? "Drafts"
      : model.reviewOrigin || / · Agent \d+$/.test(model.name)
        ? "Agent snapshots"
        : "Saved models")
  );
}
export function modelKey(model: Pick<Model, "name" | "language">): string {
  return JSON.stringify([model.language || "qasm", model.name]);
}
export type ModelFolderNode = {
  path: string;
  name: string;
  children: ModelFolderNode[];
  models: Model[];
  count: number;
};
export function modelFolderTree(
  models: Model[],
  folders: string[] = [],
  query = "",
): ModelFolderNode[] {
  const roots: ModelFolderNode[] = [],
    nodes = new Map<string, ModelFolderNode>();
  const term = query.trim().toLowerCase();
  const ensure = (path: string) => {
    let siblings = roots,
      current: ModelFolderNode | undefined;
    const parts = path.split("/");
    for (let i = 0; i < parts.length; i++) {
      const prefix = parts.slice(0, i + 1).join("/");
      current = nodes.get(prefix);
      if (!current) {
        current = {
          path: prefix,
          name: parts[i],
          children: [],
          models: [],
          count: 0,
        };
        nodes.set(prefix, current);
        siblings.push(current);
      }
      siblings = current.children;
    }
    return current!;
  };
  for (const path of folders) {
    const normalized = normalizeModelFolder(path);
    if (normalized && (!term || normalized.toLowerCase().includes(term)))
      ensure(normalized);
  }
  for (const model of models) {
    const path = modelFolder(model);
    if (term && !`${path}/${model.name}`.toLowerCase().includes(term)) continue;
    ensure(path).models.push(model);
  }
  const finish = (items: ModelFolderNode[]) => {
    items.sort((a, b) => a.name.localeCompare(b.name));
    for (const node of items) {
      finish(node.children);
      node.count =
        node.models.length +
        node.children.reduce((sum, child) => sum + child.count, 0);
    }
  };
  finish(roots);
  return roots;
}
