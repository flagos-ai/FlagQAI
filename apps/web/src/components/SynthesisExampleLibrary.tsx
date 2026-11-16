import { useState } from "react";
import type { Model } from "../contracts/quantum-workspace";
import {
  synthesisExampleCopy,
  synthesisExampleTree,
  synthesisRevision,
  type ExampleFolder,
  type SynthesisExample,
  recordedSynthesisCheck,
  synthesisAcceptance,
} from "../state/synthesis-catalog";
import { UIIcon } from "./UIIcon";

export function SynthesisExampleLibrary({
  query,
  matches,
  models,
  onSelect,
}: {
  query: string;
  matches: SynthesisExample[];
  models: Model[];
  onSelect: (model: Model) => void;
}) {
  const [expanded, setExpanded] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("fq-synthesis-catalog-expanded-v1") || "[]",
      );
      return Array.isArray(saved)
        ? saved.filter((item) => typeof item === "string")
        : [];
    } catch {
      return [];
    }
  });
  const searching = !!query.trim();
  const showLibrary = searching || expanded.includes("library");
  const toggle = (key: string, event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    if (searching) return;
    const next = expanded.includes(key)
      ? expanded.filter((item) => item !== key)
      : [...expanded, key];
    try {
      localStorage.setItem(
        "fq-synthesis-catalog-expanded-v1",
        JSON.stringify(next),
      );
    } catch {
      /* Disclosure remains usable without storage. */
    }
    setExpanded(next);
  };
  const entry = (item: SynthesisExample) => (
    <div className="fq-synthesis-example" key={item.id}>
      {item.source ? (
        <button
          className="fq-library-card"
          onClick={() => onSelect(synthesisExampleCopy(item, models))}
          title={item.purpose}
        >
          <span className="fq-library-title">
            <UIIcon name="file" size={14} />
            <span>{item.title}</span>
          </span>
          <small>{item.purpose}</small>
          <span className="fq-example-open" aria-hidden="true">
            Open copy →
          </span>
        </button>
      ) : (
        <a
          className="fq-synthesis-reference"
          href={item.readme}
          target="_blank"
          rel="noreferrer"
          title="Official documentation; not yet integrated for execution in this workbench"
        >
          <span>{item.name}</span>
          <small>Docs ↗</small>
        </a>
      )}
    </div>
  );
  const info = (item: SynthesisExample) => (
    <details className="fq-synthesis-example-info">
      <summary>{item.title} · Scope and source</summary>
      <p>{item.purpose}</p>
      <p>
        Official quantum-program comparison recorded.{" "}
        {item.upstreamWorkflowValidated
          ? "Official local Notebook workflow recorded."
          : "Complete Notebook workflow not certified."}
      </p>
      {recordedSynthesisCheck(item) && (
        <p>
          Local acceptance recorded {synthesisAcceptance.recordedAt}: run,
          independent comparison and saved replay passed with SDK{" "}
          {synthesisAcceptance.sdkVersion}.
        </p>
      )}
      <p>
        Requires synth APIs: {item.requiredCapabilities?.join(", ")}. SDK
        version numbers alone do not establish compatibility.
      </p>
      <p>
        Current environment has not been checked. Run explicitly to create a new
        local result and saved circuit.
      </p>
      <a href={item.readme} target="_blank" rel="noreferrer">
        Official source and comparison ↗
      </a>
    </details>
  );
  const folders = (nodes: ExampleFolder[]): React.ReactNode =>
    nodes.map((node) => (
      <details
        key={node.path}
        className="fq-synthesis-folder"
        open={searching || expanded.includes(node.path)}
      >
        <summary onClick={(event) => toggle(node.path, event)}>
          <UIIcon name="tree" size={14} />
          <span>{node.name}</span>
          <small>{node.count}</small>
        </summary>
        {(searching || expanded.includes(node.path)) && (
          <div className="fq-synthesis-folder-contents">
            {folders(node.children)}
            {node.entries.map(entry)}
          </div>
        )}
      </details>
    ));
  if (!matches.length) return null;
  const editable = matches.filter((item) => item.source);
  const starterIds = [
    "functions/qft",
    "functions/hamiltonian_evolution/suzuki_trotter",
    "tutorials/basics/quantum_programming/synthesis_tutorial",
  ];
  const starters = searching
    ? editable
    : starterIds
        .map((id) => editable.find((item) => item.id === id))
        .filter((item): item is SynthesisExample => !!item);
  return (
    <section
      className="fq-model-library-group fq-synthesis-library"
      aria-label="Synthesis examples"
    >
      <details className="fq-synthesis-shelf" open={showLibrary}>
        <summary onClick={(event) => toggle("library", event)}>
          High-level synthesis examples <small>{matches.length}</small>
        </summary>
        {showLibrary && (
          <>
            {editable.length > 0 && (
              <>
                <div className="fq-synthesis-starters">
                  {starters.map(entry)}
                </div>
                {!searching && (
                  <details
                    className="fq-synthesis-featured"
                    open={expanded.includes("featured")}
                  >
                    <summary onClick={(event) => toggle("featured", event)}>
                      More editable examples{" "}
                      <small>{editable.length - starters.length}</small>
                    </summary>
                    {editable
                      .filter((item) => !starterIds.includes(item.id))
                      .map(entry)}
                  </details>
                )}
              </>
            )}
            <details
              className="fq-synthesis-catalog"
              open={searching || expanded.includes("catalog")}
            >
              <summary onClick={(event) => toggle("catalog", event)}>
                Browse official catalog <small>{matches.length} entries</small>
              </summary>
              <p className="fq-synthesis-catalog-note">
                Browse by topic. Entries marked Docs open documentation, not the
                editor.
              </p>
              {(searching || expanded.includes("catalog")) &&
                folders(synthesisExampleTree(matches))}
            </details>
            <details className="fq-synthesis-provenance">
              <summary>Source &amp; verification details</summary>
              <p className="fq-synthesis-catalog-note">
                Pinned {synthesisRevision.slice(0, 7)} · Recorded checks apply
                to the tested SDK. Current environment has not been checked.
              </p>
              {editable.map((item) => (
                <div key={item.id}>{info(item)}</div>
              ))}
              <a
                className="fq-synthesis-catalog-license"
                href="/examples/synthesis/acceptance.json"
                target="_blank"
                rel="noreferrer"
              >
                Recorded local verification ↗
              </a>
              {" · "}
              <a
                className="fq-synthesis-catalog-license"
                href="/licenses/flagquantum-examples/NOTICE.txt"
                target="_blank"
                rel="noreferrer"
              >
                Sources and licenses ↗
              </a>
            </details>
          </>
        )}
      </details>
    </section>
  );
}
