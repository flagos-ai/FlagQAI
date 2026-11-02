import { useEffect, useState } from "react";
import {
  researchPackages,
  type ResearchPackage,
  type ResearchPackageItem,
} from "../api/research-packages";
import { readExperiment } from "../api/experiments";
import type { WorkspaceAction } from "../contracts/quantum-workspace";
import { ResearchRecord } from "./ResearchRecord";
import { Modal } from "./Modal";
import { CloseButton } from "./CloseButton";
export function ResearchPackages({
  dispatch,
}: {
  dispatch: React.Dispatch<WorkspaceAction>;
}) {
  const [open, setOpen] = useState(false),
    [items, setItems] = useState<ResearchPackageItem[]>([]),
    [selected, setSelected] = useState<ResearchPackage>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = () =>
    researchPackages
      .list()
      .then(setItems)
      .catch((problem) => setError(String(problem)));
  useEffect(() => {
    if (open) void refresh();
  }, [open]);
  const compare = async (a: string, b: string) => {
    const records = await Promise.all(
      [a, b].map((id) => readExperiment(selected!.local_ids[id])),
    );
    for (const record of records)
      dispatch({ type: "import-experiment", record });
    setOpen(false);
    dispatch({
      type: "compare-experiments",
      left: records[0].id,
      right: records[1].id,
    });
  };
  return (
    <>
      <button
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        Research
      </button>
      {open && !selected && (
        <Modal
          className="fq-research-library"
          label="Research packages"
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <header>
            <h2>Research packages</h2>
            <CloseButton
              label="Close research packages"
              onClick={() => {
                if (!busy) setOpen(false);
              }}
            />
          </header>
          <p>
            Import a research ZIP to restore its objective, versions, original
            archives and adoption note. Your editor draft is retained. Importing
            never runs bundled Python.
          </p>
          <label className="fq-research-upload">
            Import research ZIP
            <input
              aria-label="Import research ZIP"
              type="file"
              accept=".zip,application/zip"
              disabled={busy}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                setBusy(true);
                setError("");
                try {
                  const record = await researchPackages.import(file);
                  setSelected(record);
                  await refresh();
                } catch (problem) {
                  setError(String(problem));
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
          {busy && (
            <p role="status">
              Checking file hashes and reading .fqx archives with the SDK…
            </p>
          )}
          {error && <p role="alert">{error}</p>}
          <section aria-label="Imported research packages">
            <h3>Imported records</h3>
            {!items.length && !busy && <p>No imported research yet.</p>}
            {items.map((item) => (
              <button
                key={item.id}
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    setSelected(await researchPackages.read(item.id));
                  } catch (problem) {
                    setError(String(problem));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {item.name} · {item.run_count} runs · {item.id.slice(-8)}
              </button>
            ))}
          </section>
        </Modal>
      )}
      {open && selected && (
        <ResearchRecord
          runId={selected.research.root_run}
          turns={selected.research.turns}
          imported={selected}
          onClose={() => {
            setSelected(undefined);
          }}
          onCompare={compare}
          onInspect={async () => {}}
          onCircuit={async (id) => {
            const record = await readExperiment(selected.local_ids[id]);
            dispatch({ type: "import-experiment", record, open: true });
            setOpen(false);
          }}
          onLoadSource={(name, source) => {
            dispatch({
              type: "model",
              model: { name: "Imported · " + name, source, language: "python" },
              preserveDraft: true,
            });
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
