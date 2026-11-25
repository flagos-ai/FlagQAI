import { SynthesisFileTree } from "./SynthesisFileTree";
import { ToolbarMenu } from "./ToolbarMenu";
import { ModelFolderLibrary } from "./ModelFolderLibrary";
import { modelFolderTree } from "../state/model-folders";
import {
  synthesisExamples,
  synthesisExampleCopy,
} from "../state/synthesis-catalog";
import { UIIcon } from "./UIIcon";
import { CodeExample } from "./CodeExample";
import { useEffect, useRef, useState } from "react";
import type { Model, WorkspaceAction } from "../contracts/quantum-workspace";
import {
  pythonExamples as examples,
  interpretPythonPrompt as interpretPrompt,
} from "../state/python-templates";

export function ModelLibrary({
  models,
  folders,
  dispatch,
  onSelect,
  onUpload,
  busy,
  importing,
  projectPanel,
  projectRequest = 0,
  onOpenNotebook,
}: {
  onOpenNotebook: (id: string) => void;
  onCreateNotebook: (
    id: string,
    request: string,
  ) => Promise<boolean | undefined>;
  projectPanel?: React.ReactNode;
  projectRequest?: number;
  busy?: boolean;
  importing?: boolean;
  models: Model[];
  folders?: string[];
  dispatch: (action: WorkspaceAction) => void;
  onSelect: (model: Model) => void;
  onUpload: (file: File) => void;
}) {
  const [tab, setTab] = useState<"models" | "templates" | "project">(() => {
      if (projectRequest) return "project";
      try {
        const saved = localStorage.getItem("fq-model-library-tab-v1");
        if (
          saved === "models" ||
          saved === "templates" ||
          (saved === "project" && projectPanel)
        )
          return saved;
      } catch {
        /* Use the default library. */
      }
      return "models";
    }),
    [libraryView, setLibraryView] = useState<"files" | "examples">(() => {
      try {
        return localStorage.getItem("fq-model-library-view-v1") === "examples"
          ? "examples"
          : "files";
      } catch {
        return "files";
      }
    }),
    [query, setQuery] = useState(""),
    [prompt, setPrompt] = useState(""),
    [candidate, setCandidate] = useState<Model | null>(null);
  const [attempted, setAttempted] = useState(false);
  const upload = useRef<HTMLInputElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const term = query.trim().toLowerCase();
  const folderPaths = modelFolderTree(models, folders);
  const folderMatches = term
    ? modelFolderTree(models, folders, term)
    : folderPaths;
  useEffect(() => {
    try {
      localStorage.setItem("fq-model-library-view-v1", libraryView);
    } catch {
      /* Navigation remains usable without storage. */
    }
  }, [libraryView]);
  const clearSearch = () => {
    setQuery("");
    search.current?.focus({ preventScroll: true });
  };
  useEffect(() => {
    try {
      localStorage.setItem("fq-model-library-tab-v1", tab);
    } catch {
      /* Tab switching still works without storage. */
    }
  }, [tab]);
  useEffect(() => {
    if (projectRequest) setTab("project");
  }, [projectRequest]);
  return (
    <>
      <div className="fq-tabs fq-model-library-tabs">
        {projectPanel && (
          <button
            className={tab === "project" ? "active" : ""}
            onClick={() => setTab("project")}
          >
            PROJECT
          </button>
        )}
        <button
          className={tab === "models" ? "active" : ""}
          onClick={() => setTab("models")}
        >
          MODELS
        </button>
        <button
          className={tab === "templates" ? "active" : ""}
          onClick={() => setTab("templates")}
        >
          TEMPLATES
        </button>
      </div>
      {tab === "project" ? (
        projectPanel
      ) : tab === "models" ? (
        <div className="fq-library-body fq-model-library">
          <div className="fq-model-library-tools">
            <div className="fq-library-create-row">
              <ToolbarMenu
                label="New Model"
                closeOnSelect
                trigger={
                  <>
                    <UIIcon name="plus" size={14} />
                    <span>New Model</span>
                  </>
                }
              >
                <button
                  onClick={() =>
                    onSelect({
                      name: "Untitled Model",
                      source: examples[0].source,
                      language: "python",
                      pythonStyle: "gates",
                    })
                  }
                >
                  Gate-level circuit
                </button>
                <button
                  onClick={() => {
                    const starter = synthesisExamples.find(
                      (item) => item.id === "functions/qft" && item.source,
                    );
                    if (starter)
                      onSelect({
                        ...synthesisExampleCopy(starter, models),
                        pythonStyle: "synthesis",
                      });
                  }}
                >
                  High-level synthesis
                </button>
              </ToolbarMenu>
              <button
                className="fq-model-import"
                aria-label="Import model or experiment"
                title="Import Python / OpenQASM (up to 32 KiB) or .fqx (up to 16 MiB)"
                disabled={busy || importing}
                onClick={() => upload.current?.click()}
              >
                <UIIcon name="upload" size={14} />
                <span>{importing ? "Importing…" : "Import"}</span>
              </button>
            </div>
            <input
              hidden
              type="file"
              ref={upload}
              accept=".qasm,.txt,.py,.fqx"
              onChange={(e) => {
                if (e.target.files?.[0]) onUpload(e.target.files[0]);
                e.target.value = "";
              }}
            />
            <div className="fq-library-search">
              <input
                ref={search}
                aria-label="Search models"
                placeholder="Search files and examples"
                value={query}
                maxLength={128}
                onKeyDown={(event) => {
                  if (event.key !== "Escape") return;
                  if (event.nativeEvent.isComposing) {
                    event.preventDefault();
                    event.stopPropagation();
                  } else if (query) {
                    event.preventDefault();
                    event.stopPropagation();
                    clearSearch();
                  }
                }}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button
                  className="fq-control-icon"
                  aria-label="Clear model search"
                  title="Clear search (Esc)"
                  onClick={clearSearch}
                >
                  <UIIcon name="close" size={14} />
                </button>
              )}
            </div>
          </div>
          <div
            className="fq-library-view-switch"
            role="group"
            aria-label="Model library view"
          >
            <button
              aria-pressed={libraryView === "files"}
              onClick={() => {
                setLibraryView("files");
                setQuery("");
              }}
            >
              My files
            </button>
            <button
              aria-pressed={libraryView === "examples"}
              onClick={() => {
                setLibraryView("examples");
                setQuery("");
              }}
            >
              Examples
            </button>
          </div>
          {(term || libraryView === "files") &&
            (!term || folderMatches.length > 0) && (
              <ModelFolderLibrary
                models={models}
                tree={folderMatches}
                paths={folderPaths}
                searching={!!term}
                onSelect={onSelect}
                dispatch={dispatch}
              />
            )}
          {(term || libraryView === "examples") && (
            <>
              <SynthesisFileTree
                query={query}
                onSelect={onSelect}
                onOpenNotebook={onOpenNotebook}
              />
            </>
          )}
        </div>
      ) : (
        <div className="fq-library-body fq-template-library">
          <small className="eyebrow">LOCAL TEMPLATE GENERATOR</small>
          <h2>What would you like to build?</h2>
          <p>
            Bell, GHZ, or bounded quantum arithmetic. This uses deterministic
            templates.
          </p>
          <textarea
            aria-label="Template description"
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              setCandidate(null);
              setAttempted(false);
            }}
            placeholder="Create quantum arithmetic: 3*x + 2"
          />
          <button
            className="primary"
            disabled={!prompt.trim()}
            onClick={() => {
              setAttempted(true);
              setCandidate(interpretPrompt(prompt) || null);
            }}
          >
            Generate model →
          </button>
          <div className="fq-chips">
            {["Quantum arithmetic: 3*x + 2", "Bell pair", "GHZ state"].map(
              (text) => (
                <button
                  key={text}
                  onClick={() => {
                    setPrompt(text);
                    setAttempted(true);
                    setCandidate(interpretPrompt(text) || null);
                  }}
                >
                  {text} ↗
                </button>
              ),
            )}
          </div>
          {candidate ? (
            <>
              <CodeExample
                key={candidate.name}
                title={candidate.name}
                code={candidate.source}
                language="python"
              />
              <button className="primary" onClick={() => onSelect(candidate)}>
                Apply model →
              </button>
            </>
          ) : attempted ? (
            <p role="alert">
              No matching local template. Try Bell, GHZ, or arithmetic a*x + b
              with a from 1–7 and b from 0–3.
            </p>
          ) : (
            <p>
              Choose a supported template, then review and apply its source.
            </p>
          )}
        </div>
      )}
      <footer>
        {tab === "project"
          ? "Local project files · browser drafts retained"
          : "Models stored locally"}
      </footer>
    </>
  );
}
