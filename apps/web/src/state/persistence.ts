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

export function readJSON<T>(storage: Storage, key: string, fallback: T): T {
  try {
    return JSON.parse(storage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
export function restoreWorkspace(
  storage: Storage,
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
  const legacySource = storage.getItem("fq-code");
  const fresh = saved.source == null && legacySource == null;
  const source = saved.source ?? legacySource ?? pythonExample;
  const name =
    saved.name ||
    storage.getItem("fq-name") ||
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
    schema: "flagqai.quantum-workspace.v1",
    language: fresh || saved.language === "python" ? "python" : "qasm",
    languageDrafts: saved.languageDrafts,
    pythonRunId: saved.pythonRunId,
    page: page as WorkspaceState["page"],
    name,
    source,
    editorLink:
      saved.editorLink &&
      saved.editorLink.modelName === name &&
      /^[a-f0-9]{32}\.(?:qasm|py)$/.test(saved.editorLink.id) &&
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
export function persistWorkspace(storage: Storage, state: WorkspaceState) {
  try {
    const {
      source,
      name,
      language,
      languageDrafts,
      pythonRunId,
      agentOpen,
      programs,
      models,
      selectedProgramId,
      selectedJobId,
      shots,
      seed,
      schema,
      editorLink,
    } = state;
    storage.setItem(
      "fq-react-workspace-v1",
      JSON.stringify({
        schema,
        language,
        languageDrafts,
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
      }),
    );
    storage.setItem("fq-code", source);
    storage.setItem("fq-name", name);
    storage.setItem(
      "fq-quantum-programs-v1",
      JSON.stringify(programs.filter((program) => !program.experiment)),
    );
  } catch {
    /* In-memory editing remains available when storage quota is exhausted. */
  }
}
