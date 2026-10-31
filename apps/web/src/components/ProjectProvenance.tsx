import type {
  ProjectRun,
  WorkspaceState,
} from "../contracts/quantum-workspace";
import { projectDirty } from "../state/project-workspace";
export function ProjectProvenance({
  project,
  state,
}: {
  project?: ProjectRun;
  state: WorkspaceState;
}) {
  if (!project) return null;
  const current = state.project?.id === project.id ? state.project : undefined;
  const entryDraft =
    current?.snapshot_hash === project.disk_hash &&
    project.disk_hash !== project.snapshot_hash;
  const changed =
    current?.snapshot_hash &&
    !entryDraft &&
    current.snapshot_hash !== project.snapshot_hash;
  const drafts = state.projectTabs?.some(
    (tab) => tab.project.id === project.id && projectDirty(tab),
  );
  return (
    <section className="fq-project-provenance">
      <small className="eyebrow">PROJECT SNAPSHOT</small>
      <p>
        {project.name} / {project.entry} ·{" "}
        <code title={project.snapshot_hash}>
          {project.snapshot_hash.slice(0, 8)}
        </code>
      </p>
      <p role="status">
        {changed
          ? "Project files changed since this run. Run the entry again to update results."
          : entryDraft
            ? "This run includes an entry draft. Saved disk inputs differ from that snapshot."
            : drafts
              ? "Unsaved project drafts exist. This result belongs to the recorded input snapshot."
              : current
                ? "Project disk inputs match the recorded snapshot."
                : "Saved project snapshot"}
      </p>
      <details>
        <summary>Recorded input files · {project.files.length}</summary>
        {project.files.map((file) => (
          <p key={file.path}>
            <code title={file.sha256}>{file.sha256.slice(0, 8)}</code>{" "}
            {file.path}
          </p>
        ))}
      </details>
    </section>
  );
}
