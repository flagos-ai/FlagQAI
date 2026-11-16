import { pythonStyleLabels, validPythonStyle } from "../state/python-style";
import { useState } from "react";
import type { Model, WorkspaceAction } from "../contracts/quantum-workspace";
import {
  defaultModelFolders,
  modelFolder,
  modelKey,
  normalizeModelFolder,
  type ModelFolderNode,
} from "../state/model-folders";
import { UIIcon } from "./UIIcon";

export function ModelFolderLibrary({
  models,
  tree,
  paths,
  searching,
  onSelect,
  dispatch,
}: {
  models: Model[];
  tree: ModelFolderNode[];
  paths: ModelFolderNode[];
  searching: boolean;
  onSelect: (model: Model) => void;
  dispatch: (action: WorkspaceAction) => void;
}) {
  const [collapsed, setCollapsed] = useState<string[]>(() => {
    try {
      const value = JSON.parse(
        localStorage.getItem("fq-model-folders-collapsed-v1") || "[]",
      );
      return Array.isArray(value)
        ? value.filter((item) => typeof item === "string")
        : [];
    } catch {
      return [];
    }
  });
  const [editing, setEditing] = useState<{ model?: Model; path: string }>();
  const [error, setError] = useState("");
  const options = new Set(defaultModelFolders);
  const collect = (nodes: ModelFolderNode[]) =>
    nodes.forEach((node) => {
      options.add(node.path);
      collect(node.children);
    });
  collect(paths);
  const edit = (model?: Model) => {
    setEditing({ model, path: model ? modelFolder(model) : "" });
    setError("");
  };
  const rememberCollapsed = (next: string[]) => {
    setCollapsed(next);
    try {
      localStorage.setItem(
        "fq-model-folders-collapsed-v1",
        JSON.stringify(next),
      );
    } catch {
      /* Tree remains usable without storage. */
    }
  };
  const render = (nodes: ModelFolderNode[]) =>
    nodes.map((node) => {
      const expanded = searching || !collapsed.includes(node.path);
      return (
        <div key={node.path} className="fq-model-folder">
          <button
            className="fq-model-folder-toggle"
            aria-expanded={expanded}
            aria-disabled={searching}
            onClick={() => {
              if (!searching)
                rememberCollapsed(
                  expanded
                    ? [...collapsed, node.path]
                    : collapsed.filter((item) => item !== node.path),
                );
            }}
            title={node.path}
          >
            <svg
              className="fq-model-folder-chevron"
              data-expanded={expanded}
              aria-hidden="true"
              viewBox="0 0 16 16"
            >
              <path d="m6 4 4 4-4 4" />
            </svg>
            <span>{node.name}</span>
            <small>{node.count}</small>
          </button>
          {expanded && (
            <div className="fq-model-folder-contents">
              {render(node.children)}
              {node.models.map((model) => {
                const style =
                  model.language === "python" &&
                  validPythonStyle(model.pythonStyle);
                return (
                  <div className="fq-model-folder-file" key={modelKey(model)}>
                    <button
                      className="fq-library-card"
                      onClick={() => onSelect(model)}
                      title={model.name}
                    >
                      <span className="fq-library-title">
                        <UIIcon name="file" size={14} />
                        <span>{model.name}</span>
                      </span>
                      <small
                        title={`${model.language === "python" ? "Python" : "OpenQASM"}${model.reviewOrigin ? " · Reviewed snapshot" : ""}`}
                      >
                        {model.language === "python" ? "Python" : "OpenQASM"}
                        {style ? ` · ${pythonStyleLabels[style]}` : ""}
                        {model.reviewOrigin ? " · Reviewed snapshot" : ""}
                      </small>
                    </button>
                    <button
                      className="fq-control-icon fq-model-folder-move"
                      aria-label="Move to folder"
                      aria-description={model.name}
                      title="Move to folder"
                      onClick={() => edit(model)}
                    >
                      <UIIcon name="tree" size={14} />
                    </button>
                  </div>
                );
              })}
              {!node.count && !node.children.length && (
                <small className="fq-model-folder-empty">No models</small>
              )}
            </div>
          )}
        </div>
      );
    });
  return (
    <section className="fq-model-library-group" aria-label="My models">
      <div className="fq-model-folders-heading">
        <small className="eyebrow">MY MODELS {models.length}</small>
        <button
          aria-label="New model folder"
          title="New folder; use / for nested folders"
          onClick={() => edit()}
        >
          <UIIcon name="plus" size={14} />
          <span>New folder</span>
        </button>
      </div>
      {editing && (
        <form
          className="fq-model-folder-form"
          onSubmit={(event) => {
            event.preventDefault();
            const path = normalizeModelFolder(editing.path);
            if (!path) {
              setError(
                "Use 1–8 folder names separated by /; no . or .. segments.",
              );
              return;
            }
            dispatch(
              editing.model
                ? {
                    type: "model-folder-move",
                    key: modelKey(editing.model),
                    path,
                  }
                : { type: "model-folder-create", path },
            );
            rememberCollapsed(
              collapsed.filter(
                (item) => path !== item && !path.startsWith(item + "/"),
              ),
            );
            setEditing(undefined);
          }}
        >
          <label>
            {editing.model ? `Move ${editing.model.name}` : "New folder"}
            <input
              autoFocus
              aria-label="Model folder path"
              list="fq-model-folder-paths"
              maxLength={240}
              placeholder="Research / QAOA"
              value={editing.path}
              onChange={(event) =>
                setEditing({ ...editing, path: event.target.value })
              }
            />
          </label>
          <datalist id="fq-model-folder-paths">
            {[...options].map((path) => (
              <option key={path} value={path} />
            ))}
          </datalist>
          {error && <small role="alert">{error}</small>}
          <div>
            <button type="submit">{editing.model ? "Move" : "Create"}</button>
            <button type="button" onClick={() => setEditing(undefined)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {render(tree)}
    </section>
  );
}
