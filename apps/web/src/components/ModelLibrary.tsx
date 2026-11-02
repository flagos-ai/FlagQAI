import { qaoaTaskName, qaoaSource } from "../tasks/qaoa-maxcut.mjs";
import { UIIcon } from "./UIIcon";
import { CodeExample } from "./CodeExample";
import { useEffect, useRef, useState } from "react";
import type { Model } from "../contracts/quantum-workspace";
import {
  pythonExamples as examples,
  interpretPythonPrompt as interpretPrompt,
} from "../state/python-templates";

export function ModelLibrary({
  models,
  onSelect,
  onUpload,
  busy,
  importing,
  projectPanel,
  projectRequest = 0,
}: {
  projectPanel?: React.ReactNode;
  projectRequest?: number;
  busy?: boolean;
  importing?: boolean;
  models: Model[];
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
    [query, setQuery] = useState(""),
    [prompt, setPrompt] = useState(""),
    [candidate, setCandidate] = useState<Model | null>(null);
  const [attempted, setAttempted] = useState(false);
  const upload = useRef<HTMLInputElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const term = query.trim().toLowerCase();
  const visibleExamples = examples.filter((model) =>
    model.name.toLowerCase().includes(term),
  );
  const showReferenceTask = qaoaTaskName.toLowerCase().includes(term);
  const visibleModels = models.filter((model) =>
    model.name.toLowerCase().includes(term),
  );
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
            <button
              className="outline"
              disabled={busy}
              onClick={() => upload.current?.click()}
            >
              <UIIcon name="upload" size={14} />
              {importing ? "Importing file…" : "Import model or experiment"}
            </button>
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
            <small>Python / OpenQASM: up to 32 KiB · .fqx: up to 16 MiB</small>
            <div className="fq-library-search">
              <input
                ref={search}
                aria-label="Search models"
                placeholder="⌕ Search models"
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
          {!visibleExamples.length &&
            !visibleModels.length &&
            !showReferenceTask && (
              <p role="status">
                No models match your search. Try another name or clear the
                search.
              </p>
            )}
          {(!term || visibleExamples.length > 0) && (
            <section
              className="fq-model-library-group"
              aria-label="Example models"
            >
              <small className="eyebrow">EXAMPLES</small>
              {visibleExamples.map((m) => (
                <button
                  className="fq-library-card"
                  key={m.name}
                  onClick={() => onSelect(m)}
                >
                  <span className="fq-library-title">
                    <UIIcon name="file" size={14} />
                    {m.name}
                  </span>
                  <small>
                    {m.name.includes("Arithmetic")
                      ? "Superposition · res = 3x + 2"
                      : "Python · Quantum circuit"}
                  </small>
                </button>
              ))}
            </section>
          )}
          {showReferenceTask && (
            <section
              className="fq-model-library-group"
              aria-label="Reference research task"
            >
              <small className="eyebrow">RESEARCH WORKFLOW</small>
              <button
                className="fq-library-card"
                onClick={() =>
                  onSelect({
                    name: qaoaTaskName,
                    source: qaoaSource,
                    language: "python",
                  })
                }
              >
                <span className="fq-library-title">
                  <UIIcon name="circuit" size={14} />
                  {qaoaTaskName}
                </span>
                <small>Optimize · Compare · Save and replay</small>
              </button>
            </section>
          )}
          {(!term || visibleModels.length > 0) && (
            <section className="fq-model-library-group" aria-label="My models">
              <small className="eyebrow">MY MODELS {models.length}</small>
              {visibleModels.map((m) => (
                <button
                  key={(m.language || "qasm") + ":" + m.name}
                  className="fq-library-card"
                  onClick={() => onSelect(m)}
                >
                  <span className="fq-library-title">
                    <UIIcon name="file" size={14} />
                    {m.name}
                  </span>
                  <small
                    title={
                      m.reviewOrigin
                        ? `Reviewed file ${m.reviewOrigin.fileId} · revision ${m.reviewOrigin.revision}`
                        : undefined
                    }
                  >
                    {m.language === "python" ? "Python" : "OpenQASM"}
                    {m.reviewOrigin ? " · Reviewed snapshot" : ""}
                  </small>
                </button>
              ))}
            </section>
          )}
          <button
            className="secondary"
            onClick={() =>
              onSelect({
                name: "Untitled Model",
                source: examples[0].source,
                language: "python",
              })
            }
          >
            <UIIcon name="plus" size={14} />
            New Model
          </button>
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
