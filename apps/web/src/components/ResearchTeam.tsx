import type { ResearchRun, ResearchTaskLink } from "../api/research-runs";
import { ResearchConstraintReview } from "./ResearchConstraintReview";

function TaskVersion({
  link,
  onOpen,
}: {
  link: ResearchTaskLink;
  onOpen: (id: string) => void;
}) {
  const { task } = link;
  return (
    <section
      className="fq-research-team-task"
      aria-label="Research task version"
    >
      <strong>
        {task.task} · v{task.task_version ?? 1}
      </strong>
      {" · "}
      <span className="fq-research-status">{task.status}</span>
      <p>
        Constraints v{task.constraint_revision}
        {task.constraints_current
          ? " · current"
          : " · superseded; retained for traceability"}
      </p>
      {!task.evidence.length && (
        <p className="fq-muted">No verification report linked.</p>
      )}
      {task.evidence.map((item, index) => (
        <p key={item.run_id + ":" + index}>
          <button className="link" onClick={() => onOpen(item.run_id)}>
            View linked verification
          </button>
          {" · "}
          Code{" "}
          <code title={item.source_sha256}>
            {item.source_sha256.slice(0, 12)}
          </code>
          {" · "}
          Report{" "}
          <code title={item.report_sha256}>
            {item.report_sha256.slice(0, 12)}
          </code>
          {!item.constraints_current &&
            " · historical evidence under earlier constraints"}
        </p>
      ))}
      <details>
        <summary>Task details and history</summary>
        <p>{task.constraints}</p>
        <p>
          Project <code>{link.project_id}</code> · Task <code>{task.id}</code>
          {task.previous_task_id && (
            <>
              {" "}
              · Continues <code>{task.previous_task_id}</code>
            </>
          )}
        </p>
        <p>
          Coordinator <code>{link.coordinator_session_id}</code> · Worker{" "}
          <code>{task.worker_session_id}</code>
        </p>
        <p>
          Project baseline v{task.project_revision} · Starting code{" "}
          <code title={task.source_sha256}>
            {task.source_sha256.slice(0, 12)}
          </code>
        </p>
        <p>
          Verifier{" "}
          <code title={task.verifier_sha256}>
            {task.verifier_sha256.slice(0, 12)}
          </code>
        </p>
        {task.events.map((event, index) => (
          <div key={index}>
            <p>
              {event.status}
              {" · "}
              <time dateTime={event.at}>{event.at}</time>
              {event.native_run_id && (
                <>
                  {" "}
                  · Native run <code>{event.native_run_id}</code>
                </>
              )}
            </p>
            {event.detail && <pre>{event.detail}</pre>}
          </div>
        ))}
      </details>
    </section>
  );
}

export function ResearchTeam({
  run,
  onOpen,
  onOpenChange,
  onUpdated,
  open,
}: {
  run: ResearchRun;
  onOpen: (id: string) => void;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
  open: boolean;
}) {
  const links = run.coordination || [];
  if (!links.length) return null;
  return (
    <details
      className="fq-research-team"
      open={open}
      onToggle={(event) => {
        if (event.target === event.currentTarget)
          onOpenChange(event.currentTarget.open);
      }}
    >
      <summary>Research team · {links.length} linked tasks</summary>
      {(run.coordination_projects || []).map((project) => (
        <ResearchConstraintReview
          key={project.coordinator_session_id + ":" + project.project_id}
          project={project}
          runId={run.id}
          onUpdated={onUpdated}
        />
      ))}
      {links
        .filter((link) => link.task.constraints_current)
        .map((link) => (
          <TaskVersion
            key={
              link.coordinator_session_id +
              ":" +
              link.project_id +
              ":" +
              link.task.id
            }
            link={link}
            onOpen={onOpen}
          />
        ))}
      {links.some((link) => !link.task.constraints_current) && (
        <details>
          <summary>
            Earlier task versions ·{" "}
            {links.filter((link) => !link.task.constraints_current).length}
          </summary>
          {links
            .filter((link) => !link.task.constraints_current)
            .map((link) => (
              <TaskVersion
                key={
                  link.coordinator_session_id +
                  ":" +
                  link.project_id +
                  ":" +
                  link.task.id
                }
                link={link}
                onOpen={onOpen}
              />
            ))}
        </details>
      )}
    </details>
  );
}
