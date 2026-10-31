import type {
  WorkspaceState,
  WorkspaceAction,
  EditorLink,
  SourceLanguage,
} from "../contracts/quantum-workspace";
export type ProjectInfo = {
  id: string;
  name: string;
  path: string;
  root: string;
  files?: {
    path: string;
    size: number;
    kind: "source" | "artifact";
    revision?: string;
  }[];
  snapshot_hash?: string;
  truncated?: boolean;
  errors?: string[];
};
export type ProjectFile = {
  observedAt?: number;
  id: string;
  path: string;
  workspace_path: string;
  source: string;
  revision: string;
  project: { id: string; path: string };
};
export type ProjectTab = {
  id: string;
  project: ProjectInfo;
  path: string;
  name: string;
  source: string;
  language: SourceLanguage;
  undo: string[];
  editorLink: EditorLink;
  pythonRunId?: string;
  closed?: boolean;
};
export type ProjectDraft = Pick<
  WorkspaceState,
  "name" | "source" | "language" | "undo" | "editorLink" | "pythonRunId"
>;
export type ProjectAction =
  | { type: "project-select"; project: ProjectInfo }
  | { type: "project-open-file"; project: ProjectInfo; file: ProjectFile }
  | { type: "project-tab"; id?: string }
  | { type: "project-close-tab"; id: string }
  | { type: "project-file-update"; file: ProjectFile }
  | { type: "project-file-saved"; file: ProjectFile; source: string };
export const projectNeedsReview = (tab: ProjectTab) =>
  !!tab.editorLink.incoming || tab.editorLink.change?.outcome === "pending";
export const projectDirty = (tab: ProjectTab) =>
  tab.source !== tab.editorLink.base;
export function checkpointProject(state: WorkspaceState): WorkspaceState {
  if (state.activeProjectTab)
    return {
      ...state,
      projectTabs: state.projectTabs?.map((tab) =>
        tab.id === state.activeProjectTab
          ? {
              ...tab,
              source: state.source,
              undo: state.undo,
              editorLink: state.editorLink || tab.editorLink,
              pythonRunId: state.pythonRunId,
            }
          : tab,
      ),
    };
  return state.project
    ? {
        ...state,
        projectScratch: {
          name: state.name,
          source: state.source,
          language: state.language,
          undo: state.undo,
          editorLink: state.editorLink,
          pythonRunId: state.pythonRunId,
        },
      }
    : state;
}
function activate(state: WorkspaceState, id?: string): WorkspaceState {
  const tab = state.projectTabs?.find((item) => item.id === id);
  if (!tab)
    return {
      ...state,
      ...state.projectScratch,
      activeProjectTab: undefined,
      error: null,
    };
  return {
    ...state,
    name: tab.name,
    source: tab.source,
    language: tab.language,
    editorLink: tab.editorLink,
    undo: tab.undo,
    pythonRunId: tab.pythonRunId,
    activeProjectTab: tab.id,
    project: state.project?.id === tab.project.id ? state.project : tab.project,
    projectTabs: state.projectTabs?.map((item) =>
      item.id === id ? { ...item, closed: false } : item,
    ),
    page: "model",
    error: null,
  };
}
function receive(tab: ProjectTab, file: ProjectFile): ProjectTab {
  const link = tab.editorLink;
  if (file.observedAt && link.savedAt && file.observedAt < link.savedAt)
    return tab;
  if (
    link.revision === file.revision ||
    link.incoming?.revision === file.revision
  )
    return tab;
  if (tab.source !== link.base && tab.source !== file.source)
    return {
      ...tab,
      editorLink: {
        ...link,
        incoming: { source: file.source, revision: file.revision },
      },
    };
  return {
    ...tab,
    source: file.source,
    undo: [...tab.undo, tab.source].slice(-40),
    editorLink: {
      ...link,
      base: file.source,
      revision: file.revision,
      incoming: undefined,
      previous: tab.source,
      updated: Date.now(),
      change: {
        before: tab.source,
        after: file.source,
        agentSource: file.source,
        revision: file.revision,
        outcome: "pending",
      },
    },
  };
}
export function projectTransition(
  state: WorkspaceState,
  action: WorkspaceAction,
): WorkspaceState | undefined {
  switch (action.type) {
    case "project-select":
      return { ...state, project: action.project };
    case "project-tab":
      return activate(state, action.id);
    case "project-close-tab": {
      const tabs = state.projectTabs?.map((tab) =>
        tab.id === action.id ? { ...tab, closed: true } : tab,
      );
      const next = { ...state, projectTabs: tabs };
      return state.activeProjectTab === action.id
        ? activate(next, tabs?.find((tab) => !tab.closed)?.id)
        : next;
    }
    case "project-open-file": {
      state = {
        ...state,
        projectTabs: state.projectTabs?.filter(
          (tab) => !tab.closed || projectDirty(tab) || tab.editorLink.incoming,
        ),
      };
      const existing = state.projectTabs?.find(
        (tab) => tab.id === action.file.id,
      );
      if (!existing && (state.projectTabs?.length || 0) >= 32)
        return {
          ...state,
          error: {
            source: state.source,
            message:
              "32 cached project files are open. Existing drafts are retained.",
          },
        };
      const name = action.file.path.replace(/\.(py|qasm)$/, "");
      const { files: _, ...project } = action.project;
      const tab: ProjectTab = existing
        ? receive(existing, action.file)
        : {
            id: action.file.id,
            project,
            path: action.file.path,
            name,
            source: action.file.source,
            language: action.file.path.toLowerCase().endsWith(".py")
              ? "python"
              : "qasm",
            undo: [],
            editorLink: {
              ...action.file,
              path: action.file.workspace_path,
              modelName: name,
              base: action.file.source,
            },
          };
      return activate(
        {
          ...state,
          project: action.project,
          projectTabs: [
            ...(state.projectTabs || []).filter((item) => item.id !== tab.id),
            tab,
          ],
          projectScratch: state.projectScratch || {
            name: state.name,
            source: state.source,
            language: state.language,
            undo: state.undo,
            editorLink: state.editorLink,
            pythonRunId: state.pythonRunId,
          },
        },
        tab.id,
      );
    }
    case "project-file-update": {
      if (action.file.id === state.activeProjectTab) return state; // The active editor uses the shared review reducer.
      return {
        ...state,
        projectTabs: state.projectTabs?.map((tab) =>
          tab.id === action.file.id ? receive(tab, action.file) : tab,
        ),
      };
    }
    case "project-file-saved": {
      const saved = (tab: ProjectTab): ProjectTab => ({
        ...tab,
        editorLink: {
          ...tab.editorLink,
          base: action.source,
          revision: action.file.revision,
          savedAt: Date.now(),
          incoming:
            tab.editorLink.incoming?.revision === action.file.revision
              ? undefined
              : tab.editorLink.incoming,
        },
      });
      const tabs = state.projectTabs?.map((tab) =>
        tab.id === action.file.id ? saved(tab) : tab,
      );
      const active = tabs?.find((tab) => tab.id === state.activeProjectTab);
      return {
        ...state,
        projectTabs: tabs,
        ...(active ? { editorLink: active.editorLink } : {}),
      };
    }
  }
}
