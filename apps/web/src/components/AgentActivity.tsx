import { useEffect, useState } from "react";
import type { SessionViewRow } from "../../../../packages/sdk/index.d.ts";
import {
  activityDuration,
  cleanToolOutput,
  previewOutput,
  toolPresentation,
  type Tool,
} from "../state/agent-activity";
import { AgentMarkdown } from "./AgentMarkdown";
function ActivityMarker({
  active,
  error = false,
  thinking = false,
}: {
  active: boolean;
  error?: boolean;
  thinking?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={
        "fq-activity-marker " +
        (active ? "active" : error ? "error" : thinking ? "thought" : "done")
      }
    >
      {active ? "◌" : error ? "✗" : thinking ? "⚓" : "•"}
    </span>
  );
}
function useElapsed(start: number | undefined, active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active || start === undefined) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [start, active]);
  return start === undefined ? undefined : Math.max(0, now - start);
}
export function AgentTool({ tool }: { tool: Tool }) {
  const [expanded, setExpanded] = useState(false),
    running = tool.status === "running" || tool.status === "pending",
    failed = tool.status === "error";
  const elapsed = useElapsed(tool.startedAt, running),
    presentation = toolPresentation(tool);
  const live = running && !!tool.liveOutput;
  const output = live
    ? cleanToolOutput(tool.liveOutput || "")
    : presentation.body;
  const preview = previewOutput(output, live),
    duration = activityDuration(running ? elapsed : tool.durationMs);
  const id = "fq-tool-" + encodeURIComponent(tool.callId);
  return (
    <section
      className={
        "fq-cli-tool " + presentation.category + (failed ? " failed" : "")
      }
      aria-label={tool.name + " tool call"}
    >
      <button
        className="fq-activity-header"
        aria-expanded={expanded}
        aria-controls={expanded ? id : undefined}
        onClick={() => setExpanded(!expanded)}
      >
        <ActivityMarker active={running} error={failed} />
        <strong>{tool.name}</strong>
        <span className="fq-activity-title" title={presentation.detail}>
          {presentation.detail}
        </span>
        <span className="fq-activity-meta">
          {running ? "Running" : failed ? "Failed" : "Done"}
          {duration ? " · " + duration : ""}
        </span>
        <span
          className={"fq-activity-chevron " + (expanded ? "expanded" : "")}
          aria-hidden="true"
        >
          ›
        </span>
      </button>
      {output && (
        <div
          className={"fq-activity-output " + (presentation.diff ? "diff" : "")}
          aria-label={live ? "Live tool output" : "Tool result preview"}
        >
          <span className="fq-activity-gutter" aria-hidden="true">
            ⎿
          </span>
          <pre>
            {(expanded
              ? live
                ? output.slice(-16000)
                : output.slice(0, 16000)
              : preview.text
            )
              .split("\n")
              .map((line, i) => (
                <span
                  key={i}
                  className={
                    presentation.diff && line.startsWith("+")
                      ? "added"
                      : presentation.diff && line.startsWith("-")
                        ? "removed"
                        : ""
                  }
                >
                  {line}
                  {"\n"}
                </span>
              ))}
          </pre>
        </div>
      )}
      {!expanded && preview.omitted > 0 && (
        <button className="fq-activity-more" onClick={() => setExpanded(true)}>
          Show {preview.omitted} more {preview.omitted === 1 ? "line" : "lines"}
        </button>
      )}
      {expanded && output.length > 16000 && (
        <small className="fq-activity-footnote">
          Showing {live ? "latest" : "first"} 16,000 characters.
        </small>
      )}
      {tool.liveOutputDropped ? (
        <small className="fq-activity-footnote">
          {tool.liveOutputDropped} earlier live lines omitted by runtime
        </small>
      ) : null}
      {presentation.exit !== undefined && presentation.exit !== 0 && (
        <small className="fq-activity-footnote error">
          Exit code {presentation.exit}
        </small>
      )}
      {expanded && (
        <div id={id} className="fq-activity-details">
          <details>
            <summary>Arguments</summary>
            <pre>
              {cleanToolOutput(tool.argsFull || tool.argsText || "").slice(
                0,
                16000,
              ) || "No arguments supplied."}
            </pre>
          </details>
          {(tool.resultFull || tool.resultText || tool.errorText) && (
            <details>
              <summary>Raw result</summary>
              <pre>
                {cleanToolOutput(
                  tool.errorText || tool.resultFull || tool.resultText || "",
                ).slice(0, 16000)}
              </pre>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
export function AgentThinking({
  row,
  active,
}: {
  row: SessionViewRow;
  active: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const preview = row.text.trimEnd().split("\n").slice(-3).join("\n");
  if (!row.text && !row.reasoningTokens) return null;
  return (
    <section className="fq-cli-thinking" aria-label="Agent thinking">
      <button
        className="fq-activity-header"
        aria-expanded={expanded}
        aria-controls={expanded ? "fq-thinking-" + row.id : undefined}
        onClick={() => setExpanded(!expanded)}
      >
        <ActivityMarker active={active} thinking />
        <span>{active ? "Thinking…" : "Thought"}</span>
        <span className="fq-activity-meta">
          {row.durationMs !== undefined ? activityDuration(row.durationMs) : ""}
          {row.reasoningTokens
            ? " · " + row.reasoningTokens.toLocaleString() + " tokens"
            : ""}
        </span>
        <span
          className={"fq-activity-chevron " + (expanded ? "expanded" : "")}
          aria-hidden="true"
        >
          ›
        </span>
      </button>
      {active && !expanded && preview && (
        <div className="fq-thinking-preview">{preview}</div>
      )}
      <div
        id={"fq-thinking-" + row.id}
        hidden={!expanded}
        className="fq-thinking-body"
      >
        <AgentMarkdown text={row.text} />
      </div>
    </section>
  );
}
