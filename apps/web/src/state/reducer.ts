import { checkpointProject, projectTransition } from "./project-workspace.ts";
import { examples } from "./templates.ts";
import { pythonExample } from "./python-workspace.ts";
import type {
  WorkspaceAction,
  WorkspaceState,
} from "../contracts/quantum-workspace";

export function workspaceReducer(
  state: WorkspaceState,
  action: WorkspaceAction,
): WorkspaceState {
  let prepared = checkpointProject(state);
  const project = projectTransition(prepared, action);
  if (project) return checkpointProject(project);
  if (
    prepared.activeProjectTab &&
    (["model", "open-agent-model"].includes(action.type) ||
      (action.type === "language" && action.language !== prepared.language))
  )
    prepared = { ...prepared, activeProjectTab: undefined };
  return checkpointProject(reduceWorkspace(prepared, action));
}

function reduceWorkspace(
  state: WorkspaceState,
  action: WorkspaceAction,
): WorkspaceState {
  switch (action.type) {
    case "compare-experiments":
      return {
        ...state,
        comparison:
          action.left && action.right && action.left !== action.right
            ? { left: action.left, right: action.right }
            : undefined,
        page: "jobs",
      };
    case "project-select":
    case "project-open-file":
    case "project-tab":
    case "project-close-tab":
    case "project-file-update":
    case "project-file-saved":
      return state;
    case "restore-experiments": {
      // Restore the archive list as one transaction: intermediate records must
      // not replace a saved selection that has not loaded into memory yet.
      const selectedId = state.selectedProgramId;
      const restored = {
        ...action.records.reduce(
          (current, record) =>
            workspaceReducer(current, { type: "import-experiment", record }),
          state,
        ),
      };
      const selected =
        state.programs.find((p) => p.id === selectedId) ||
        action.records.find((r) => r.program.id === selectedId)?.program;
      if (selected) {
        if (!restored.programs.some((p) => p.id === selected.id))
          restored.programs = [...restored.programs.slice(0, 7), selected];
        restored.selectedProgramId = selected.id;
      } else if (
        !restored.programs.some((p) => p.id === restored.selectedProgramId)
      ) {
        restored.selectedProgramId = restored.programs[0]?.id || null;
      }
      return restored;
    }
    case "import-experiment": {
      const { program, job } = action.record;
      const existing = state.programs.some((p) => p.id === program.id);
      const ordered =
        action.open || !existing || state.selectedProgramId === program.id
          ? [program, ...state.programs.filter((p) => p.id !== program.id)]
          : state.programs.map((p) => (p.id === program.id ? program : p));
      const programs = ordered
        .sort((a, b) => b.created - a.created)
        .slice(0, 8);
      // New artifacts must remain visible even when the recent list is full.
      // Keep the currently viewed circuit available without navigating away.
      const selected =
        !action.open &&
        state.programs.find((p) => p.id === state.selectedProgramId);
      if (selected && !programs.some((p) => p.id === selected.id))
        programs[programs.length - 1] = selected;
      return {
        ...state,
        programs,
        jobs: job
          ? [job, ...state.jobs.filter((item) => item.id !== job.id)]
          : state.jobs,
        selectedProgramId: action.open
          ? program.id
          : state.selectedProgramId || program.id,
        selectedJobId: action.open && job ? job.id : state.selectedJobId,
        page: action.open ? "program" : state.page,
        // Archive navigation never changes source, language, links or undo history.
      };
    }
    case "python-run":
      return { ...state, pythonRunId: action.id };
    case "language": {
      const previous = state.language || "qasm";
      if (previous === action.language) return state;
      const draft =
        state.languageDrafts?.[action.language] ||
        (action.language === "python"
          ? { name: "Python Bell pair", source: pythonExample, undo: [] }
          : { ...examples[0], undo: [] });
      return {
        ...state,
        language: action.language,
        ...draft,
        editorLink: draft.editorLink,
        error: null,
        languageDrafts: {
          ...state.languageDrafts,
          [previous]: {
            name: state.name,
            source: state.source,
            editorLink: state.editorLink,
            undo: state.undo,
          },
        },
      };
    }
    case "add-agent-model": {
      if (state.models.some((model) => model.source === action.model.source))
        return state;
      let name = action.model.name,
        suffix = 1;
      while (state.models.some((model) => model.name === name))
        name = `${action.model.name} · Agent ${suffix++}`;
      return { ...state, models: [{ ...action.model, name }, ...state.models] };
    }
    case "open-agent-model": {
      // Keep a separate recoverable copy before explicit/followed model navigation.
      const backup =
        state.source === action.model.source
          ? []
          : [
              {
                name: `Draft · ${state.name} · ${action.file.id.slice(0, 8)}`,
                source: state.source,
                language: state.language || "qasm",
              },
            ];
      const next = workspaceReducer(state, {
        type: "model",
        model: action.model,
      });
      return {
        ...next,
        models: [...backup, ...state.models],
        editorLink: {
          ...action.file,
          modelName: action.model.name,
          base: action.file.source,
        },
      };
    }
    case "link-editor":
      if (
        state.name !== action.name ||
        action.file.id.endsWith(".py") !== (state.language === "python")
      )
        return state;
      return {
        ...state,
        editorLink: {
          ...action.file,
          modelName: action.name,
          base: action.file.source,
          // A draft edited while sharing must never become the file baseline.
          ...(state.source !== action.expectedSource
            ? {
                incoming: {
                  source: action.file.source,
                  revision: action.file.revision,
                },
              }
            : {}),
        },
      };
    case "review-agent-change": {
      const link = state.editorLink,
        change = link?.change;
      if (
        !link ||
        !change ||
        link.id !== action.id ||
        change.revision !== action.revision ||
        state.source !== action.expectedSource ||
        link.incoming
      )
        return state;
      if (
        action.decision === "undo" &&
        (state.source !== change.after ||
          change.outcome === "undone" ||
          change.outcome === "kept")
      )
        return state;
      const source =
        action.decision === "undo" ||
        (action.decision === "keep" && state.source === change.after)
          ? change.before
          : state.source;
      return {
        ...state,
        source,
        error: source === state.source ? state.error : null,
        undo:
          source === state.source
            ? state.undo
            : [...state.undo, state.source].slice(-40),
        editorLink: {
          ...link,
          previous: state.source,
          change: {
            ...change,
            outcome:
              action.decision === "accept"
                ? "accepted"
                : action.decision === "keep"
                  ? "kept"
                  : "undone",
          },
        },
      };
    }
    case "unlink-editor":
      return { ...state, editorLink: undefined };
    case "file-changed": {
      const link = state.editorLink;
      if (
        !link ||
        (link.savedAt !== undefined && action.time < link.savedAt) ||
        link.id !== action.id ||
        link.incoming?.revision === action.revision
      )
        return state;
      if (link.revision === action.revision)
        return link.incoming
          ? { ...state, editorLink: { ...link, incoming: undefined } }
          : state;
      if (state.source !== link.base && state.source !== action.source)
        return {
          ...state,
          editorLink: {
            ...link,
            incoming: { source: action.source, revision: action.revision },
          },
        };
      return {
        ...state,
        source: action.source,
        error: null,
        undo:
          state.source === action.source
            ? state.undo
            : [...state.undo, state.source].slice(-40),
        editorLink: {
          ...link,
          base: action.source,
          revision: action.revision,
          incoming: undefined,
          updated: action.time,
          previous: state.source,
          change: {
            before:
              link.change?.outcome === "pending" &&
              link.change.after === state.source
                ? link.change.before
                : state.source,
            after: action.source,
            agentSource: action.source,
            revision: action.revision,
            outcome: "pending",
          },
        },
      };
    }
    case "resolve-file": {
      const link = state.editorLink;
      if (
        !link ||
        link.id !== action.id ||
        link.incoming?.revision !== action.revision ||
        state.source !== action.expectedSource
      )
        return state;
      return {
        ...state,
        source: action.source,
        error: action.source === state.source ? state.error : null,
        undo:
          state.source === action.source
            ? state.undo
            : [...state.undo, state.source].slice(-40),
        editorLink: {
          ...link,
          base: link.incoming.source,
          revision: link.incoming.revision,
          incoming: undefined,
          updated: Date.now(),
          previous: state.source,
          change: {
            before: state.source,
            after: action.source,
            agentSource: link.incoming.source,
            revision: action.revision,
            outcome: action.source === state.source ? "kept" : "accepted",
          },
        },
      };
    }
    case "navigate":
      return {
        ...state,
        page: action.page,
        selectedProgramId:
          action.page === "program" &&
          !state.programs.some((p) => p.id === state.selectedProgramId)
            ? state.programs[0]?.id || null
            : state.selectedProgramId,
        execution:
          action.page === "execution" && state.page === "program"
            ? state.programs.find((p) => p.id === state.selectedProgramId) ||
              null
            : action.page === "execution"
              ? state.execution
              : null,
      };
    case "edit":
      return {
        ...state,
        source: action.source,
        error: null,
        undo:
          state.source === action.source
            ? state.undo
            : [...state.undo, state.source].slice(-40),
      };
    case "undo":
      return state.undo.length
        ? {
            ...state,
            source: state.undo.at(-1)!,
            undo: state.undo.slice(0, -1),
            error: null,
          }
        : state;
    case "model": {
      const previous = state.language || "qasm";
      const language = action.model.language || "qasm";
      const models = [...state.models];
      if (
        action.preserveDraft &&
        (state.source !== action.model.source || previous !== language) &&
        !models.some(
          (model) =>
            model.source === state.source &&
            (model.language || "qasm") === previous,
        )
      ) {
        let name = `Draft · ${state.name}`,
          suffix = 1;
        while (models.some((model) => model.name === name))
          name = `Draft · ${state.name} · ${suffix++}`;
        models.unshift({ name, source: state.source, language: previous });
      }
      return {
        ...state,
        editorLink: undefined,
        name: action.model.name,
        source: action.model.source,
        models,
        language,
        languageDrafts: {
          ...state.languageDrafts,
          [previous]: {
            name: state.name,
            source: state.source,
            editorLink: state.editorLink,
            undo: state.undo,
          },
        },
        page: "model",
        error: null,
        execution: null,
        undo: [...state.undo, state.source].slice(-40),
      };
    }
    case "compiled": {
      const programs = [
        action.program,
        ...state.programs.filter((p) => p.source !== action.program.source),
      ].slice(0, 8);
      return {
        ...state,
        programs,
        selectedProgramId: action.program.id,
        page: state.source === action.program.source ? "program" : state.page,
        error: null,
      };
    }
    case "import-agent-program":
      return state.programs.some((program) => program.id === action.program.id)
        ? state
        : {
            ...state,
            programs: [action.program, ...state.programs].slice(0, 8),
            selectedProgramId: state.selectedProgramId || action.program.id,
          };
    case "recover-program":
      return state.programs.some((p) => p.source === action.program.source)
        ? state
        : {
            ...state,
            programs: [...state.programs, action.program].slice(0, 8),
            selectedProgramId: state.selectedProgramId || action.program.id,
          };
    case "program":
      return state.programs.some((p) => p.id === action.id)
        ? { ...state, selectedProgramId: action.id, zoom: 90 }
        : state;
    case "merge-jobs":
      return workspaceReducer(state, {
        type: "jobs",
        jobs: [
          ...action.jobs,
          ...state.jobs.filter(
            (job) => !action.jobs.some((item) => item.id === job.id),
          ),
        ],
      });
    case "jobs":
      return {
        ...state,
        jobs: action.jobs,
        selectedJobId: action.jobs.some((j) => j.id === state.selectedJobId)
          ? state.selectedJobId
          : action.jobs[0]?.id || null,
      };
    case "job":
      return { ...state, selectedJobId: action.id };
    case "busy":
      return { ...state, busy: action.value };
    case "error":
      return {
        ...state,
        error: { source: action.source, message: action.message },
      };
    case "preferences": {
      const { type: _, ...preferences } = action;
      return { ...state, ...preferences };
    }
    case "agent":
      return { ...state, agentOpen: action.open };
    case "use-draft":
      return { ...state, execution: null };
    case "save":
      return {
        ...state,
        models: [
          {
            name: state.name,
            source: state.source,
            language: state.language || "qasm",
          },
          ...state.models.filter(
            (m) =>
              m.name !== state.name ||
              (m.language || "qasm") !== (state.language || "qasm"),
          ),
        ].slice(0, 40),
      };
  }
}
