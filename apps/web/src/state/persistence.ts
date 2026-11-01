import {
  pythonExample,
  migrateLegacyPythonExample,
} from "./python-workspace.ts";
import type {
  Model,
  ProgramSnapshot,
  WorkspaceState,
} from "../contracts/quantum-workspace";
import { examples } from "./templates.ts";

type WorkspaceStorage = Pick<Storage, "getItem" | "setItem">;
export type BackupStatus =
  | { saved: true }
  | { saved: false; reason: "quota" | "unavailable" };

function readText(storage: Pick<Storage, "getItem">, key: string) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function readJSON<T>(
  storage: Pick<Storage, "getItem">,
  key: string,
  fallback: T,
): T {
  try {
    return JSON.parse(storage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
export function restoreWorkspace(
  storage: WorkspaceStorage,
  hash: string,
): WorkspaceState {
  const saved = readJSON<Partial<WorkspaceState>>(
    storage,
    "fq-react-workspace-v1",
    {},
  );
  // Explicitly supported legacy examples are upgraded with a durable recovery copy.
  const original = JSON.stringify(saved);
  let migrated = false;
  const upgrade = (source: string) => {
    const next = migrateLegacyPythonExample(source);
    migrated ||= next !== source;
    return next;
  };
  const nextSaved = {
    ...saved,
    source:
      typeof saved.source === "string" ? upgrade(saved.source) : saved.source,
    languageDrafts: saved.languageDrafts
      ? Object.fromEntries(
          Object.entries(saved.languageDrafts).map(([key, draft]) => [
            key,
            {
              ...draft,
              source: upgrade(draft.source),
            },
          ]),
        )
      : saved.languageDrafts,
    models: saved.models?.map((model) => ({
      ...model,
      source: upgrade(model.source),
    })),
  };
  if (migrated) {
    try {
      const key = "fq-before-save-load-migration-v1";
      if (!storage.getItem(key)) storage.setItem(key, original);
      Object.assign(saved, nextSaved);
    } catch {
      // Keep the original draft if a recovery copy cannot be saved.
    }
  }
  const legacySource = readText(storage, "fq-code");
  const fresh = saved.source == null && legacySource == null;
  const source = saved.source ?? legacySource ?? pythonExample;
  const name =
    saved.name ||
    readText(storage, "fq-name") ||
    (fresh ? "Python Bell pair" : examples[0].name);
  const validPrograms = (value: unknown): value is ProgramSnapshot[] =>
    Array.isArray(value);
  const previous = readJSON<ProgramSnapshot[]>(
    storage,
    "fq-quantum-programs-v1",
    [],
  );
  const programs = (validPrograms(saved.programs) ? saved.programs : previous)
    .filter(
      (p) =>
        typeof p.source === "string" && Array.isArray(p.compiled?.instructions),
    )
    .slice(0, 8);
  const page = ["model", "synthesis", "program", "execution", "jobs"].includes(
    hash,
  )
    ? hash
    : "model";
  return {
    project: saved.project,
    projectTabs: Array.isArray(saved.projectTabs)
      ? saved.projectTabs
          .filter(
            (tab) =>
              typeof tab.path === "string" &&
              typeof tab.source === "string" &&
              tab.editorLink?.project,
          )
          .slice(0, 32)
      : [],
    activeProjectTab: saved.activeProjectTab,
    projectScratch: saved.projectScratch,
    schema: "flagqai.quantum-workspace.v1",
    language: fresh || saved.language === "python" ? "python" : "qasm",
    languageDrafts: saved.languageDrafts,
    comparison:
      saved.comparison &&
      [saved.comparison.left, saved.comparison.right].every(
        (id) => typeof id === "string" && /^fqx-[a-f0-9]{32}$/.test(id),
      ) &&
      saved.comparison.left !== saved.comparison.right
        ? saved.comparison
        : undefined,
    pythonRunId: saved.pythonRunId,
    page: page as WorkspaceState["page"],
    name,
    source,
    editorLink:
      saved.editorLink &&
      saved.editorLink.modelName === name &&
      (/^[a-f0-9]{32}\.(?:qasm|py)$/.test(saved.editorLink.id) ||
        !!saved.editorLink.project) &&
      typeof saved.editorLink.base === "string" &&
      typeof saved.editorLink.revision === "string"
        ? saved.editorLink
        : undefined,
    programs,
    selectedProgramId:
      programs.some((p) => p.id === saved.selectedProgramId) ||
      (typeof saved.selectedProgramId === "string" &&
        /^fqx-[a-f0-9]{32}$/.test(saved.selectedProgramId))
        ? saved.selectedProgramId!
        : programs[0]?.id || null,
    models: Array.isArray(saved.models)
      ? saved.models
      : readJSON<Model[]>(storage, "fq-documents", []),
    jobs: [],
    selectedJobId:
      typeof saved.selectedJobId === "string" ? saved.selectedJobId : null,
    execution: null,
    shots: saved.shots || 2048,
    seed: saved.seed ?? 42,
    jobName: "",
    zoom: 90,
    agentOpen: saved.agentOpen === true,
    busy: false,
    error: null,
    undo: [],
  };
}
export function workspaceBackup(state: WorkspaceState) {
  const {
    source,
    name,
    language,
    languageDrafts,
    comparison,
    pythonRunId,
    agentOpen,
    programs,
    models,
    selectedProgramId,
    selectedJobId,
    shots,
    seed,
    schema,
    project,
    projectTabs,
    activeProjectTab,
    projectScratch,
    editorLink,
  } = state;
  return JSON.stringify({
    schema,
    project,
    projectTabs: projectTabs?.map((tab) => ({ ...tab, undo: [] })),
    activeProjectTab,
    projectScratch: projectScratch
      ? { ...projectScratch, undo: [] }
      : undefined,
    language,
    languageDrafts,
    comparison,
    pythonRunId,
    agentOpen,
    editorLink,
    source,
    name,
    programs: programs.filter((program) => !program.experiment),
    models,
    selectedProgramId,
    selectedJobId,
    shots,
    seed,
  });
}

export function persistWorkspace(
  storage: WorkspaceStorage,
  state: WorkspaceState,
): BackupStatus {
  try {
    // This single write is authoritative. A failure must keep the previous
    // snapshot intact; never clear storage to make room for a new draft.
    const snapshot = workspaceBackup(state);
    if (readText(storage, "fq-react-workspace-v1") === snapshot)
      return { saved: true };
    storage.setItem("fq-react-workspace-v1", snapshot);
  } catch (error) {
    return {
      saved: false,
      reason:
        error instanceof Error && /Quota/i.test(error.name)
          ? "quota"
          : "unavailable",
    };
  }
  try {
    // Legacy mirrors are optional once the complete snapshot is durable.
    const { source, name, programs } = state;
    storage.setItem("fq-code", source);
    storage.setItem("fq-name", name);
    storage.setItem(
      "fq-quantum-programs-v1",
      JSON.stringify(programs.filter((program) => !program.experiment)),
    );
  } catch {
    /* The authoritative workspace snapshot was already saved. */
  }
  return { saved: true };
}
