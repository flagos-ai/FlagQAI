import type { WorkspaceState } from "../contracts/quantum-workspace";
import { workspaceBackup, type BackupStatus } from "../state/persistence";
import { download } from "../state/exports";

export function WorkspaceBackupNotice({
  status,
  state,
  onRetry,
}: {
  status: BackupStatus;
  state: WorkspaceState;
  onRetry: () => void;
}) {
  if (status.saved) return null;
  return (
    <section
      className="fq-backup-notice"
      role="alert"
      aria-label="Workspace backup unavailable"
    >
      <div>
        <strong>Browser backup unavailable</strong>
        <p>
          {status.reason === "quota"
            ? "Browser storage is full. "
            : "Browser storage could not be updated. "}
          Your latest edits are still in this tab. Keep it open or download a
          backup before leaving.
        </p>
      </div>
      <div>
        <button onClick={onRetry}>Retry backup</button>
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
      </div>
    </section>
  );
}
