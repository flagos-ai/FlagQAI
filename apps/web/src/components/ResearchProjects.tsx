import { useEffect, useRef, useState } from "react";
import { useResearchRuns } from "../hooks/useResearchRuns";
import { researchRunsAPI } from "../api/research-runs";
import { researchProjects } from "../state/research-projects";
import { UIIcon } from "./UIIcon";
import type { WorkspaceAction } from "../contracts/quantum-workspace";

export function ResearchProjects({
  dispatch,
}: {
  dispatch: React.Dispatch<WorkspaceAction>;
}) {
  const { runs, error, reload } = useResearchRuns();
  const [openError, setOpenError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const projects = researchProjects(runs);
  const open = async (id: string) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setOpenError("");
    const controller = new AbortController();
    pending.current = controller;
    try {
      const result = await researchRunsAPI.read(id, controller.signal);
      if (controller.signal.aborted) return;
      if (result.run.id !== id)
        throw Error("Research run identity did not match.");
      dispatch({ type: "research-run", id });
    } catch (problem) {
      if (!controller.signal.aborted)
        setOpenError(
          problem instanceof Error ? problem.message : String(problem),
        );
    } finally {
      lock.current = false;
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  if (!projects.length && !error) return null;
  return (
    <section
      className="fq-research-projects"
      aria-label="Workspace research history"
    >
      <header>
        <h3>Workspace research</h3>
        <button
          className="link"
          onClick={reload}
          aria-label="Refresh research history"
        >
          Refresh
        </button>
      </header>
      {error && <p role="alert">{error} Saved list may be out of date.</p>}
      {openError && <p role="alert">{openError}</p>}
      {projects.map((project) => (
        <button
          key={project.id}
          disabled={busy}
          aria-label={`Open latest research run for ${project.name}`}
          title={`${project.latest.title} · ${project.latest.id}`}
          onClick={() => void open(project.latest.id)}
        >
          <span>
            <strong>{project.name}</strong>
            <small>
              {project.count} {project.count === 1 ? "run" : "runs"} · Latest:{" "}
              {project.latest.status === "review"
                ? "review required"
                : project.latest.status}
            </small>
            <small>{project.latest.title}</small>
          </span>
          <UIIcon name="arrow" size={14} />
        </button>
      ))}
    </section>
  );
}
