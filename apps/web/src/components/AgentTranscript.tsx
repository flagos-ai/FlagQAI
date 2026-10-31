import { agentRunStatus, stopFeedback } from "../state/agent-run-status";
import { AgentWorkspaceActions } from "./AgentWorkspaceActions";
import type { PlatformBridge } from "../hooks/usePlatformBridge";
import type { QuantumJob } from "../contracts/quantum-workspace";
import { AgentProgress } from "./AgentProgress";
import { progressTurns, childRunning } from "../state/agent-progress";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type {
  SessionViewRow,
  SessionSubagentView,
} from "../../../../packages/sdk/index.d.ts";
import type { QuestionRequestView } from "../../../../packages/protocol/agent/events.mjs";
import type { AgentConversation } from "../hooks/useAgentConversation";
import { workDuration } from "../state/agent-turns";
import { splitWorkspaceContext } from "../state/agent-view";
import { AgentTool, AgentThinking } from "./AgentActivity";
import { AgentReplyActions } from "./AgentReplyActions";
import { AgentMarkdown } from "./AgentMarkdown";
function Row({ row, thinking }: { row: SessionViewRow; thinking: boolean }) {
  if (row.kind === "tool" && row.tool) return <AgentTool tool={row.tool} />;
  if (row.kind === "reasoning")
    return <AgentThinking row={row} active={thinking} />;
  if (row.kind === "user" || row.kind === "assistant") {
    const content =
      row.kind === "user"
        ? splitWorkspaceContext(row.text)
        : { text: row.text };
    return (
      <article
        className={"fq-agent-message " + row.kind}
        aria-label={row.kind === "user" ? "Your message" : undefined}
      >
        {row.kind === "assistant" && <small>FlagQAI</small>}
        <AgentMarkdown text={content.text} />
        <AgentReplyActions
          markdown={content.text}
          question={row.kind === "user"}
        />
        {content.context && (
          <details className="fq-agent-attachment">
            <summary>
              Attached {content.context.kind} · {content.context.name}
              {content.context.attachments?.length
                ? ` +${content.context.attachments.length}`
                : ""}
            </summary>
            <strong>{content.context.name}</strong>
            <pre>{content.context.source}</pre>
            {content.context.attachments?.map((attachment, index) => (
              <div key={index}>
                <strong>{attachment.name}</strong>
                <pre>{attachment.source}</pre>
                {attachment.truncated && (
                  <small>Source truncated to 16,000 characters.</small>
                )}
              </div>
            ))}
            {content.context.truncated && (
              <small>Source truncated to 16,000 characters.</small>
            )}
          </details>
        )}
      </article>
    );
  }
  return row.text ? (
    <div className="fq-agent-notice">
      <AgentMarkdown
        text={row.label ? row.label + ": " + row.text : row.text}
      />
    </div>
  ) : null;
}
function Questions({
  request,
  agent,
}: {
  request: QuestionRequestView;
  agent: AgentConversation;
}) {
  const [answers, setAnswers] = useState(
    request.questions.map(() => ({ selected: [] as string[], custom: "" })),
  );
  return (
    <section className="fq-agent-interaction">
      <h3>Input needed</h3>
      {request.questions.map((question, index) => (
        <fieldset key={index}>
          <legend>{question.question}</legend>
          {question.detail && <p>{question.detail}</p>}
          {question.options.map((option) => (
            <label key={option.label}>
              <input
                type={question.multiSelect ? "checkbox" : "radio"}
                name={request.requestId + "-" + index}
                checked={answers[index].selected.includes(option.label)}
                onChange={() =>
                  setAnswers((previous) =>
                    previous.map((answer, i) =>
                      i !== index
                        ? answer
                        : {
                            ...answer,
                            selected: question.multiSelect
                              ? answer.selected.includes(option.label)
                                ? answer.selected.filter(
                                    (v) => v !== option.label,
                                  )
                                : [...answer.selected, option.label]
                              : [option.label],
                          },
                    ),
                  )
                }
              />
              <span>
                {option.label}
                {option.description && <small>{option.description}</small>}
              </span>
            </label>
          ))}
          {!question.hideCustomInput && (
            <input
              aria-label={"Custom answer " + (index + 1)}
              type={question.secret ? "password" : "text"}
              value={answers[index].custom}
              placeholder="Your answer…"
              onChange={(event) =>
                setAnswers((previous) =>
                  previous.map((answer, i) =>
                    i === index
                      ? { ...answer, custom: event.target.value }
                      : answer,
                  ),
                )
              }
            />
          )}
        </fieldset>
      ))}
      <div className="fq-agent-interaction-actions">
        <button
          disabled={
            !!agent.answering ||
            agent.phase !== "connected" ||
            agent.stopping ||
            agent.view.stop === "stopping" ||
            !agent.view.projected
          }
          onClick={() =>
            void agent.answer(request.requestId, "cancel-question")
          }
        >
          Cancel
        </button>
        <button
          disabled={
            !!agent.answering ||
            agent.phase !== "connected" ||
            agent.stopping ||
            agent.view.stop === "stopping" ||
            !agent.view.projected ||
            answers.some(
              (answer) => !answer.selected.length && !answer.custom.trim(),
            )
          }
          onClick={() =>
            void agent.answer(request.requestId, {
              answers: answers.map((answer) => ({
                ...answer,
                custom: answer.custom || undefined,
              })),
            })
          }
        >
          Submit answers
        </button>
      </div>
    </section>
  );
}
export function AgentTranscript({
  agent,
  roster,
  bridge,
  jobs,
}: {
  agent: AgentConversation;
  roster: SessionSubagentView[];
  bridge: PlatformBridge;
  jobs: QuantumJob[];
}) {
  const turns = progressTurns(agent.view, roster);
  const stopNotice = stopFeedback(agent.view.stop, agent.view.stopQueued);
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const questions = useRef(new Map<number, HTMLDivElement>());
  const follow = useRef(true);
  const [pinned, setPinned] = useState<number | null>(null);
  const [away, setAway] = useState(false);
  const measure = useCallback(() => {
    const node = viewport.current;
    if (!node) return;
    const offBottom =
      node.scrollHeight - node.scrollTop - node.clientHeight > 48;
    follow.current = !offBottom;
    setAway(offBottom);
    const top = node.getBoundingClientRect().top;
    let current: number | null = null;
    // Keep the question belonging to the response being read, including older turns.
    for (const [id, element] of questions.current) {
      const bounds = element.getBoundingClientRect();
      if (bounds.top > top + 2) break;
      current = bounds.bottom < top + 2 ? id : null;
    }
    setPinned(current);
  }, []);
  useLayoutEffect(() => {
    follow.current = true;
    setPinned(null);
    setAway(false);
  }, [agent.session?.id]);
  useLayoutEffect(() => {
    const node = viewport.current;
    if (follow.current && node) node.scrollTop = node.scrollHeight;
    measure();
  }, [agent.view, measure]);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(() => {
      const node = viewport.current;
      if (follow.current && node) node.scrollTop = node.scrollHeight;
      measure();
    });
    if (viewport.current) observer.observe(viewport.current);
    if (content.current) observer.observe(content.current);
    return () => observer.disconnect();
  }, [measure]);
  const questionText =
    pinned !== null && agent.view.rows[pinned]
      ? splitWorkspaceContext(agent.view.rows[pinned].text).text
      : "";
  return (
    <div className="fq-agent-transcript-shell">
      {questionText && (
        <button
          className="fq-agent-pinned-question"
          aria-label="Jump to question"
          title={questionText}
          onClick={() => {
            const node = viewport.current,
              target = questions.current.get(pinned!);
            if (!node || !target) return;
            follow.current = false;
            node.scrollTop +=
              target.getBoundingClientRect().top -
              node.getBoundingClientRect().top -
              12;
            measure();
            target.focus({ preventScroll: true });
          }}
        >
          <span className="fq-agent-question-label">Question</span>
          <span className="fq-agent-question-preview">{questionText}</span>
          <span aria-hidden="true">↑</span>
        </button>
      )}
      <div
        className="fq-agent-thread"
        ref={viewport}
        onScroll={measure}
        role="log"
        tabIndex={-1}
        aria-label="Agent conversation"
        aria-relevant="additions"
      >
        <div ref={content}>
          {turns.map((turn) => {
            const { progress, children } = turn;
            const live = turn.active || children.some(childRunning);
            const progressPanel = (
              <AgentProgress
                todos={progress?.todos}
                children={live ? [] : children}
                sessionId={agent.session?.id}
                onInspect={() => {
                  follow.current = false;
                }}
              />
            );
            const hasProgress =
              !!progress?.todos?.length || children.length > 0;
            const renderRow = (row: SessionViewRow) => (
              <div
                key={row.id}
                tabIndex={row.kind === "user" ? -1 : undefined}
                ref={
                  row.kind === "user"
                    ? (node) => {
                        if (node) questions.current.set(row.id, node);
                        else questions.current.delete(row.id);
                      }
                    : undefined
                }
              >
                <Row
                  row={row}
                  thinking={
                    turn.active &&
                    row.durationMs === undefined &&
                    row.id === agent.view.order.at(-1) &&
                    !Object.keys(agent.view.permissions).length &&
                    !Object.keys(agent.view.questions).length
                  }
                />
              </div>
            );
            // Keep the final answer and all actionable notices outside the fold.
            const question = turn.visible.filter((row) => row.kind === "user");
            const remaining = turn.visible.filter((row) => row.kind !== "user");
            const duration = workDuration(turn.durationMs);
            return (
              <div key={turn.id} className="fq-agent-turn">
                {question.map(renderRow)}
                {(turn.work.length > 0 || hasProgress) &&
                  (live ? (
                    <div className="fq-agent-work-live">
                      {progressPanel}
                      {turn.work
                        .filter((row) => row.kind !== "subagent")
                        .map(renderRow)}
                    </div>
                  ) : (
                    <details className="fq-agent-work">
                      <summary
                        onClick={() => {
                          follow.current = false;
                        }}
                      >
                        <span>Worked{duration ? " for " + duration : ""}</span>
                        <span className="fq-agent-work-count">
                          {turn.toolCount > 0
                            ? `${turn.toolCount} tool ${turn.toolCount === 1 ? "call" : "calls"}`
                            : hasProgress
                              ? "Task activity"
                              : "Thought"}
                        </span>
                        {turn.outcome && turn.outcome !== "completed" && (
                          <span>
                            {turn.outcome === "error"
                              ? "Failed"
                              : "Interrupted"}
                          </span>
                        )}
                        <svg aria-hidden="true" viewBox="0 0 16 16">
                          <path d="m6 4 4 4-4 4" />
                        </svg>
                      </summary>
                      <div className="fq-agent-work-body">
                        {progressPanel}
                        {turn.work
                          .filter((row) => row.kind !== "subagent")
                          .map(renderRow)}
                      </div>
                    </details>
                  ))}
                {remaining.map(renderRow)}
                <AgentWorkspaceActions
                  actions={bridge.actions.filter(
                    (action) =>
                      action.origin !== "ui" &&
                      action.turn_seq ===
                        turn.rows.find((row) => row.kind === "user")?.seq,
                  )}
                  jobs={jobs}
                  onOpen={bridge.open}
                />
              </div>
            );
          })}
          {Object.values(agent.view.permissions).map((request) => (
            <section className="fq-agent-interaction" key={request.requestId}>
              <h3>
                {request.title || request.displayName || "Permission needed"}
              </h3>
              <p>{request.description || request.reason || request.toolName}</p>
              {request.command && <pre>{request.command}</pre>}
              {request.blockedPath && <pre>{request.blockedPath}</pre>}
              {request.input && (
                <details>
                  <summary>Tool input</summary>
                  <pre>{JSON.stringify(request.input, null, 2)}</pre>
                </details>
              )}
              <div className="fq-agent-interaction-actions">
                {[...request.options]
                  .sort(
                    (a, b) =>
                      Number(b.kind === "reject") - Number(a.kind === "reject"),
                  )
                  .filter(
                    (option) =>
                      option.kind !== "allow-always" ||
                      (!request.suppressAlwaysAllow && !request.matchedAskRule),
                  )
                  .map((option) => (
                    <button
                      key={option.id}
                      disabled={
                        !!agent.answering ||
                        agent.phase !== "connected" ||
                        agent.stopping ||
                        agent.view.stop === "stopping" ||
                        !agent.view.projected
                      }
                      onClick={() =>
                        void agent.answer(
                          request.requestId,
                          option.kind === "allow-always"
                            ? { kind: "allow-always", optionId: option.id }
                            : option.kind === "allow-once"
                              ? { kind: "allow-once" }
                              : { kind: "reject" },
                        )
                      }
                    >
                      {agent.answering === request.requestId
                        ? "Sending decision…"
                        : option.label ||
                          (option.kind === "reject"
                            ? "Reject"
                            : option.kind === "allow-once"
                              ? "Allow once"
                              : "Always allow")}
                    </button>
                  ))}
              </div>
            </section>
          ))}
          {Object.values(agent.view.questions).map((request) => (
            <Questions
              key={request.requestId}
              request={request}
              agent={agent}
            />
          ))}
          {(agent.view.working ||
            Object.keys(agent.view.permissions).length > 0 ||
            Object.keys(agent.view.questions).length > 0) && (
            <div className="fq-agent-live" role="status">
              <span aria-hidden="true" className="fq-activity-marker active">
                ◌
              </span>{" "}
              {agentRunStatus(agent)}
            </div>
          )}
          {stopNotice && (
            <small className="fq-agent-stop-state" role="status">
              {stopNotice}
            </small>
          )}
        </div>
      </div>
      {away && (
        <button
          className="fq-agent-jump-latest"
          aria-label="Jump to latest output"
          onClick={() => {
            follow.current = true;
            if (viewport.current)
              viewport.current.scrollTop = viewport.current.scrollHeight;
            measure();
            viewport.current?.focus({ preventScroll: true });
          }}
        >
          <span aria-hidden="true">↓</span> Latest output
        </button>
      )}
    </div>
  );
}
