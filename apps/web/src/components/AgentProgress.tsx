import { useEffect, useRef, useState } from "react";
import type {
  SessionTodoItem,
  SubagentTranscriptPage,
} from "../../../../packages/sdk/index.d.ts";
import { harnessClient } from "../api/harness";
import { childTranscript, type ChildActivity } from "../state/agent-progress";
import { workDuration } from "../state/agent-turns";
import { AgentMarkdown } from "./AgentMarkdown";

const labels: Record<string, string> = {
  starting: "Starting",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
  unknown: "Status unavailable",
};
function Child({
  child,
  sessionId,
}: {
  child: ChildActivity;
  sessionId?: string;
}) {
  const [page, setPage] = useState<SubagentTranscriptPage | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const request = useRef<AbortController | null>(null);
  const running = ["running", "starting"].includes(child.status);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!running || child.startedAt === undefined) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running, child.startedAt]);
  const duration = workDuration(
    running && child.startedAt !== undefined
      ? Math.max(0, now - child.startedAt)
      : child.durationMs,
  );
  const load = async (older = false) => {
    if (!sessionId || busy) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    try {
      const result = await harnessClient.subagentHistory(
        sessionId,
        child.id,
        older ? page?.skippedFromStart : undefined,
        { signal: controller.signal },
      );
      if (!controller.signal.aborted)
        setPage(
          older && page
            ? {
                ...result,
                events: [...result.events, ...page.events],
                truncated: result.truncated || page.truncated,
              }
            : result,
        );
    } catch (problem) {
      if (!controller.signal.aborted)
        setError(
          problem instanceof Error
            ? problem.message
            : "Child transcript is unavailable.",
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  return (
    <details
      className="fq-agent-child"
      onToggle={(event) => {
        if (event.currentTarget.open && !page && !busy && !error) void load();
      }}
    >
      <summary>
        <span
          className={"fq-progress-dot " + child.status}
          aria-hidden="true"
        />
        <span className="fq-progress-title">{child.description}</span>
        <span className="fq-progress-meta">
          {labels[child.status] || child.status}
          {duration ? " · " + duration : ""}
        </span>
        <span className="fq-progress-chevron" aria-hidden="true">
          ›
        </span>
      </summary>
      <div className="fq-agent-child-detail">
        <div className="fq-child-identity">
          Subagent · {child.model || "Model not reported"}
          <small>{child.id}</small>
        </div>
        {child.lastTool && (
          <p>
            Latest tool: <code>{child.lastTool}</code>
          </p>
        )}
        {child.summary && <AgentMarkdown text={child.summary} />}
        {child.error && <p className="fq-progress-error">{child.error}</p>}
        {child.output?.length ? <pre>{child.output.join("\n")}</pre> : null}
        <div className="fq-child-history-actions">
          <button disabled={busy || !sessionId} onClick={() => void load()}>
            {busy
              ? "Loading…"
              : page
                ? "Refresh transcript"
                : "Load transcript"}
          </button>
          {page?.hasOlder && (
            <button disabled={busy} onClick={() => void load(true)}>
              Earlier activity
            </button>
          )}
        </div>
        {error && (
          <p className="fq-progress-error" role="status">
            {error}
          </p>
        )}
        {page && (
          <div className="fq-child-history" aria-label="Subagent transcript">
            {childTranscript(page.events).map((item, index) => (
              <div key={index}>
                <small>{item.label}</small>
                {item.code ? (
                  <pre>{item.text}</pre>
                ) : (
                  <AgentMarkdown text={item.text} />
                )}
              </div>
            ))}
            {!childTranscript(page.events).length && (
              <small>No readable transcript entries were returned.</small>
            )}
            {page.truncated && (
              <small>Some entries were truncated by the native service.</small>
            )}
          </div>
        )}
      </div>
    </details>
  );
}
export function AgentProgress({
  todos = [],
  children,
  sessionId,
  onInspect,
}: {
  todos?: SessionTodoItem[];
  children: ChildActivity[];
  sessionId?: string;
  onInspect?: () => void;
}) {
  const completed = todos.filter((item) => item.status === "completed").length;
  const running = children.filter((child) =>
    ["starting", "running"].includes(child.status),
  ).length;
  if (!todos.length && !children.length) return null;
  return (
    <section
      className="fq-agent-progress"
      aria-label="Task progress"
      onClick={onInspect}
    >
      {todos.length > 0 && (
        <details className="fq-agent-todos">
          <summary>
            <span aria-hidden="true">☷</span>
            <span>
              Tasks {completed}/{todos.length}
            </span>
            <progress
              value={completed}
              max={todos.length}
              aria-label={`${completed} of ${todos.length} tasks completed`}
            />
            <span className="fq-progress-chevron" aria-hidden="true">
              ›
            </span>
          </summary>
          <ol>
            {todos.map((item, index) => (
              <li key={index} className={item.status}>
                <span aria-hidden="true">
                  {item.status === "completed"
                    ? "✓"
                    : item.status === "in_progress"
                      ? "◌"
                      : "○"}
                </span>
                <span>{item.content}</span>
                <span className="fq-sr-only">
                  {item.status.replaceAll("_", " ")}
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}
      {children.length > 0 && (
        <div className="fq-agent-children">
          <div className="fq-children-heading">
            Subagents{" "}
            <span>
              {running ? `${running} running · ` : ""}
              {children.length} total
            </span>
          </div>
          {children.map((child) => (
            <Child
              key={(sessionId || "") + ":" + child.id}
              child={child}
              sessionId={sessionId}
            />
          ))}
        </div>
      )}
    </section>
  );
}
