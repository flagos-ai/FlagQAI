import { useEffect, useRef, useState } from "react";
import type {
  Model,
  WorkspaceAction,
  WorkspaceState,
} from "../contracts/quantum-workspace";
import {
  backupDrafts,
  MAX_BACKUP_BYTES,
  mergeBackupDrafts,
} from "../state/backup-import";
import { workspaceBackup } from "../state/persistence";
import { download } from "../state/exports";
import { Modal } from "./Modal";
import { CloseButton } from "./CloseButton";
import { CodeExample } from "./CodeExample";

export function WorkspaceBackups({
  state,
  dispatch,
}: {
  state: WorkspaceState;
  dispatch: React.Dispatch<WorkspaceAction>;
}) {
  const [open, setOpen] = useState(false),
    [loading, setLoading] = useState(false);
  const [drafts, setDrafts] = useState<Model[]>([]),
    [chosen, setChosen] = useState<number[]>([]);
  const [preview, setPreview] = useState<number | null>(null),
    [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [filename, setFilename] = useState("");
  const version = useRef(0);
  useEffect(
    () => () => {
      version.current++;
    },
    [],
  );
  const close = () => {
    version.current++;
    setOpen(false);
  };
  const selected = drafts.filter((_, index) => chosen.includes(index));
  const merged = mergeBackupDrafts(state.models, selected);
  const added = merged.length - state.models.length;
  const read = async (file: File) => {
    const request = ++version.current;
    setLoading(true);
    setFilename(file.name);
    setDrafts([]);
    setChosen([]);
    setPreview(null);
    setError("");
    setMessage("");
    try {
      if (file.size > MAX_BACKUP_BYTES)
        throw Error("Choose a backup no larger than 16 MiB.");
      const data = backupDrafts(
        new TextDecoder("utf-8", { fatal: true }).decode(
          await file.arrayBuffer(),
        ),
      );
      if (request !== version.current) return;
      setDrafts(data);
      setChosen(data.map((_, i) => i));
    } catch (problem) {
      if (request === version.current)
        setError(
          problem instanceof Error ? problem.message : "Cannot read backup.",
        );
    } finally {
      if (request === version.current) setLoading(false);
    }
  };
  return (
    <>
      <button
        onClick={() => {
          version.current++;
          setLoading(false);
          setError("");
          setMessage("");
          setFilename("");
          setDrafts([]);
          setChosen([]);
          setPreview(null);
          setOpen(true);
        }}
      >
        Backups
      </button>
      {open && (
        <Modal
          className="fq-attachment-preview fq-backup-dialog"
          label="Workspace backups"
          onClose={close}
        >
          <header>
            <h2>Workspace backups</h2>
            <CloseButton label="Close workspace backups" onClick={close} />
          </header>
          <p>
            Download the current workspace, or recover code drafts from a saved
            backup.
          </p>
          <button
            onClick={() =>
              download(
                "flagquantum-workspace-backup.json",
                workspaceBackup(state),
                "application/json",
              )
            }
          >
            Download workspace backup
          </button>
          <label className="fq-backup-file">
            Choose workspace backup (.json)
            <input
              type="file"
              accept=".json,application/json"
              aria-label="Choose workspace backup"
              disabled={loading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void read(file);
              }}
            />
          </label>
          <p className="fq-result-note">
            Recovery adds independent models. Your current code, project files
            and Agent session stay in place. File links, execution history and
            experiment archives are not restored. Import experiments separately
            as .fqx.
          </p>
          {error && <p role="alert">{error}</p>}
          {filename && <small>Selected backup: {filename}</small>}
          <p role="status">
            {loading
              ? "Reading backup…"
              : message ||
                (drafts.length
                  ? `${drafts.length} drafts found · ${added} new ${added === 1 ? "model" : "models"} selected`
                  : "Choose a backup to preview its drafts.")}
          </p>
          {!!drafts.length && (
            <>
              <div className="fq-backup-drafts">
                {drafts.map((draft, i) => (
                  <div key={i}>
                    <label>
                      <input
                        type="checkbox"
                        checked={chosen.includes(i)}
                        onChange={(e) =>
                          setChosen((old) =>
                            e.target.checked
                              ? [...old, i]
                              : old.filter((n) => n !== i),
                          )
                        }
                      />
                      {draft.name}
                      <small>
                        {draft.language} · {draft.source.length} characters
                        {state.models.some(
                          (model) =>
                            model.source === draft.source &&
                            (model.language || "qasm") === draft.language,
                        )
                          ? " · Already in Models"
                          : (() => {
                              const name = merged.find(
                                (model) =>
                                  model.source === draft.source &&
                                  model.language === draft.language,
                              )?.name;
                              return name && name !== draft.name
                                ? ` · Recover as ${name}`
                                : "";
                            })()}
                      </small>
                    </label>
                    <button
                      aria-label={`Preview backup draft ${i + 1}`}
                      onClick={() => setPreview(i)}
                    >
                      Preview
                    </button>
                  </div>
                ))}
              </div>
              {preview !== null && drafts[preview] && (
                <>
                  <CodeExample
                    title="Backup draft preview"
                    language={drafts[preview].language || "qasm"}
                    code={drafts[preview].source.slice(0, 20000)}
                  />
                  {drafts[preview].source.length > 20000 && (
                    <small>
                      Preview limited to 20,000 characters. Recovery keeps the
                      full source.
                    </small>
                  )}
                </>
              )}
              <footer>
                <button
                  disabled={!added || loading}
                  onClick={() => {
                    dispatch({
                      type: "import-backup-drafts",
                      models: selected,
                    });
                    setMessage(
                      `${added} ${added === 1 ? "draft" : "drafts"} recovered. Find them under Models. Existing names receive a Restored suffix.`,
                    );
                    setDrafts([]);
                    setChosen([]);
                    setPreview(null);
                  }}
                >
                  Recover selected drafts
                </button>
              </footer>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
