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
  uploadError,
  busy,
  importing,
  projectPanel,
  projectRequest = 0,
}: {
  projectPanel?: React.ReactNode;
  projectRequest?: number;
  uploadError?: string;
  busy?: boolean;
  importing?: boolean;
  models: Model[];
  onSelect: (model: Model) => void;
  onUpload: (file: File) => void;
}) {
  const [tab, setTab] = useState<"models" | "templates" | "project">(
      projectRequest ? "project" : "models",
    ),
    [query, setQuery] = useState(""),
    [prompt, setPrompt] = useState(""),
    [candidate, setCandidate] = useState<Model | null>(null);
  const upload = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (projectRequest) setTab("project");
  }, [projectRequest]);
  return (
    <>
      <div className="fq-tabs">
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
        <div className="fq-library-body">
          <button
            className="outline"
            disabled={busy}
            onClick={() => upload.current?.click()}
          >
            {importing
              ? "Importing experiment…"
              : "↥ Import model or experiment"}
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
          <small>Python · OpenQASM · .fqx experiment (up to 16 MiB)</small>
          {uploadError && <p role="alert">{uploadError}</p>}
          <input
            aria-label="Search models"
            placeholder="⌕ Search models"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <small className="eyebrow">EXAMPLES</small>
          {examples
            .filter((m) => m.name.toLowerCase().includes(query.toLowerCase()))
            .map((m) => (
              <button
                className="fq-library-card"
                key={m.name}
                onClick={() => onSelect(m)}
              >
                ◇ {m.name}
                <small>
                  {m.name.includes("Arithmetic")
                    ? "Superposition · res = 3x + 2"
                    : "Python · Quantum circuit"}
                </small>
              </button>
            ))}
          <small className="eyebrow">MY MODELS {models.length}</small>
          {models
            .filter((m) => m.name.toLowerCase().includes(query.toLowerCase()))
            .map((m) => (
              <button
                key={(m.language || "qasm") + ":" + m.name}
                className="fq-library-card"
                onClick={() => onSelect(m)}
              >
                ▤ {m.name}
                <small>{m.language === "python" ? "Python" : "OpenQASM"}</small>
              </button>
            ))}
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
            New Model ＋
          </button>
        </div>
      ) : (
        <div className="fq-library-body">
          <small className="eyebrow">LOCAL TEMPLATE GENERATOR</small>
          <h2>What would you like to build?</h2>
          <p>
            Bell, GHZ, or bounded quantum arithmetic. This uses deterministic
            templates.
          </p>
          <textarea
            aria-label="Template description"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Create quantum arithmetic: 3*x + 2"
          />
          <button
            className="primary"
            onClick={() => setCandidate(interpretPrompt(prompt) || null)}
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
              <pre>{candidate.source}</pre>
              <button className="primary" onClick={() => onSelect(candidate)}>
                Apply model →
              </button>
            </>
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
