import { validPythonStyle } from "./python-style.ts";
import { normalizeModelFolder } from "./model-folders.ts";
import type { Model } from "../contracts/quantum-workspace";

export const MAX_BACKUP_BYTES = 16 * 1024 * 1024;
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid backup structure.");
  return value as Record<string, unknown>;
};

/** Extract detached code drafts and their library locations. */
export function backupDrafts(text: string): Model[] {
  if (new TextEncoder().encode(text).length > MAX_BACKUP_BYTES)
    throw Error("Choose a backup no larger than 16 MiB.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw Error("This is not valid backup JSON.");
  }
  const data = object(parsed);
  if (data.schema !== "flagqai.quantum-workspace.v1")
    throw Error("Unsupported workspace backup version.");
  const models: Model[] = [];
  const add = (value: unknown, language?: string) => {
    const item = object(value);
    const kind = language || item.language || "qasm";
    if (
      typeof item.name !== "string" ||
      !item.name.trim() ||
      item.name.length > 256 ||
      typeof item.source !== "string" ||
      item.source.includes("\0") ||
      item.source.length > 1024 * 1024 ||
      !["python", "qasm"].includes(String(kind))
    )
      throw Error("A backup draft has invalid code, name or language.");
    const folder = normalizeModelFolder(item.folder);
    const pythonStyle = kind === "python" && validPythonStyle(item.pythonStyle);
    const duplicate = models.find(
      (model) => model.source === item.source && model.language === kind,
    );
    if (!duplicate)
      models.push({
        name: item.name,
        source: item.source,
        language: kind as "python" | "qasm",
        ...(folder ? { folder } : {}),
        ...(pythonStyle ? { pythonStyle } : {}),
      });
    else if (duplicate.name === item.name) {
      if (folder && !duplicate.folder) duplicate.folder = folder;
      if (pythonStyle && !duplicate.pythonStyle)
        duplicate.pythonStyle = pythonStyle;
    }
    if (models.length > 128)
      throw Error("Backups support up to 128 distinct code drafts.");
    // Preserve both sides of an unresolved Agent edit as separate detached drafts.
    if (item.editorLink != null) {
      const incoming = object(item.editorLink).incoming;
      if (incoming != null)
        add(
          {
            name: String(item.name).slice(0, 230) + " · Incoming",
            source: object(incoming).source,
          },
          String(kind),
        );
    }
  };
  add(data);
  for (const key of ["models", "projectTabs"]) {
    if (data[key] == null) continue;
    if (!Array.isArray(data[key]) || data[key].length > 128)
      throw Error("Invalid backup draft list.");
    data[key].forEach((item) => add(item));
  }
  if (data.projectScratch != null) add(data.projectScratch);
  if (data.agentDraft != null) add(data.agentDraft);
  if (data.languageDrafts != null) {
    for (const [kind, value] of Object.entries(object(data.languageDrafts))) {
      if (!["python", "qasm"].includes(kind))
        throw Error("Invalid backup language.");
      add(value, kind);
    }
  }
  return models;
}

export function mergeBackupDrafts(
  existing: Model[],
  incoming: Model[],
): Model[] {
  const merged = [...existing];
  for (const model of incoming) {
    if (
      merged.some(
        (m) =>
          m.source === model.source &&
          (m.language || "qasm") === model.language,
      )
    )
      continue;
    let name = model.name,
      suffix = 1;
    while (merged.some((m) => m.name === name))
      name = `${model.name.slice(0, 230)} · Restored ${suffix++}`;
    const folder = normalizeModelFolder(model.folder);
    const pythonStyle =
      model.language === "python" && validPythonStyle(model.pythonStyle);
    merged.push({
      name,
      source: model.source,
      language: model.language,
      ...(folder ? { folder } : {}),
      ...(pythonStyle ? { pythonStyle } : {}),
    });
  }
  return merged;
}
