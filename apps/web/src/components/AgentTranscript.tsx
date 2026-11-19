import { AgentResearchOutcome } from "./AgentResearchOutcome";
import { researchDeliveries } from "../state/research-delivery";
import { researchTurnsFromProgress } from "../state/research-turns";
import { iterationQuestion } from "../state/qaoa-iteration";
import { AgentExperimentTask } from "./AgentExperimentTask";
import { agentRunStatus, stopFeedback } from "../state/agent-run-status";
import { AgentWorkspaceActions } from "./AgentWorkspaceActions";
import type { PlatformBridge } from "../hooks/usePlatformBridge";
import type { QuantumJob } from "../contracts/quantum-workspace";
import { AgentProgress } from "./AgentProgress";
import {
  progressTurns,
  childRunning,
  currentTurnActivity,
  liveActivitySummary,
} from "../state/agent-progress";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type {
  SessionViewRow,
  SessionSubagentView,
} from "../../../../packages/sdk/index.d.ts";
import type { QuestionRequestView } from "../../../../packages/protocol/agent/events.mjs";
import type { AgentConversation } from "../hooks/useAgentConversation";
import { workDuration, actionBelongsToTurn } from "../state/agent-turns";
import { splitWorkspaceContext } from "../state/agent-view";
import { AgentTool, AgentThinking } from "./AgentActivity";
import { AgentReplyActions } from "./AgentReplyActions";
import { AgentMarkdown } from "./AgentMarkdown";
import { agentFailureGuidance } from "../state/agent-failure";
import { canRetryDelivery } from "../state/agent-recovery";
function Row({
  row,
  thinking,
  completedTurn,
  onOpenRun,
}: {
  row: SessionViewRow;
  thinking: boolean;
  completedTurn: boolean;
  onOpenRun: (id: string) => Promise<void>;
}) {
  if (row.kind === "tool" && row.tool)
    return (
      <AgentTool
        tool={row.tool}
        onOpenRun={onOpenRun}
        completedTurn={completedTurn}
      />
    );
  if (row.kind === "reasoning")
    return <AgentThinking row={row} active={thinking} />;
  if (row.kind === "user" || row.kind === "assistant") {
    const content =
      row.kind === "user"
        ? splitWorkspaceContext(row.text)
        : { text: row.text };
    const iteration =
      row.kind === "user" ? iterationQuestion(content.text) : null;
    return (
      <article
        className={"fq-agent-message " + row.kind}
        aria-label={row.kind === "user" ? "Your message" : undefined}
      >
        {row.kind === "assistant" && <small>FlagQAI</small>}
        <AgentMarkdown text={iteration?.summary || content.text} />
        {iteration && (
          <details className="fq-agent-attachment">
            <summary>
              Iteration details · baseline{" "}
              {iteration.reference.source.slice(0, 8)}
            </summary>
            <pre>{iteration.details}</pre>
          </details>
        )}
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
  const guidance = agentFailureGuidance(row);
  if (guidance) {
    return (
      <div className="fq-agent-notice fq-agent-failure">
        <strong>{guidance.title}</strong>
        <p>
          {guidance.summary} {guidance.nextStep}
        </p>
        <details className="fq-agent-attachment">
          <summary>Technical details</summary>
          <pre>
            {row.label ? row.label + ": " : ""}
            {row.text}
          </pre>
        </details>
      </div>
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
type ReadingPosition = {
  turn: string;
  offset: number;
  workedOpen: boolean;
  resource: string;
  cursor: number;
  unreadReply?: boolean;
};

function readPosition(key: string): ReadingPosition | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) || "null");
    return saved &&
      typeof saved.turn === "string" &&
      Number.isFinite(saved.offset) &&
      typeof saved.workedOpen === "boolean" &&
      typeof saved.resource === "string" &&
      Number.isSafeInteger(saved.cursor)
      ? saved
      : null;
  } catch {
    return null;
  }
}

function writePosition(key: string, position: ReadingPosition | null) {
  try {
    if (position) sessionStorage.setItem(key, JSON.stringify(position));
    else sessionStorage.removeItem(key);
  } catch {
    // Transcript controls also work when browser storage is unavailable.
  }
}

function atLatestOutput(node: HTMLElement) {
  return node.scrollHeight - node.scrollTop - node.clientHeight <= 2;
}

function AgentElapsedTime({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const elapsed = Math.floor(Math.max(0, now - startedAt) / 1000);
  return (
    <span className="fq-agent-live-time" role="timer" aria-label="Elapsed time">
      {elapsed > 0 ? workDuration(elapsed * 1000) : "0s"}
    </span>
  );
}

export function AgentTranscript({
  agent,
  roster,
  bridge,
  jobs,
  deliveryReady,
  onPrepare,
}: {
  agent: AgentConversation;
  roster: SessionSubagentView[];
  bridge: PlatformBridge;
  jobs: QuantumJob[];
  deliveryReady: boolean;
  onPrepare: (prompt: string) => void;
}) {
  const turns = progressTurns(agent.view, roster);
  const runStatus = agentRunStatus(agent);
  const startedAt =
    agent.phase === "connected" && agent.view.projected && agent.view.working
      ? agent.view.activeTiming?.startedAt
      : undefined;
  const activity =
    runStatus === "Working" ? currentTurnActivity(turns.at(-1)) : "";
  const researchTurns = researchTurnsFromProgress(turns, bridge.actions);
  const stopNotice = stopFeedback(agent.view.stop, agent.view.stopQueued);
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const questions = useRef(new Map<number, HTMLDivElement>());
  const follow = useRef(true);
  const pendingPosition = useRef<ReadingPosition | null>(null);
  const restoringDetails = useRef<HTMLDetailsElement | null>(null);
  const session = agent.session;
  const positionKey = session
    ? "fq-agent-reading:" +
      JSON.stringify([session.backendId, session.sessionId, session.cwd])
    : "";
  const resource = session?.id;
  const cursor = agent.view.cursor;
  const savePosition = useCallback(
    (unread: boolean) => {
      const node = viewport.current;
      if (!node || !resource || pendingPosition.current) return;
      if (follow.current) {
        writePosition(positionKey, null);
        return;
      }
      const top = node.getBoundingClientRect().top;
      const turn = Array.from(
        node.querySelectorAll<HTMLElement>("[data-reading-turn]"),
      ).find((element) => element.getBoundingClientRect().bottom > top);
      if (!turn?.dataset.readingTurn) return;
      writePosition(positionKey, {
        turn: turn.dataset.readingTurn,
        offset: top - turn.getBoundingClientRect().top,
        workedOpen: !!turn.querySelector(
          ":scope > details.fq-agent-work[open]",
        ),
        resource,
        cursor,
        unreadReply: unread,
      });
    },
    [positionKey, resource, cursor],
  );
  const [pinned, setPinned] = useState<number | null>(null);
  const [away, setAway] = useState(false);
  const [unreadReply, setUnreadReply] = useState(false);
  const previousReply = useRef<SessionViewRow | null | undefined>(undefined);
  const measure = useCallback(() => {
    const node = viewport.current;
    if (!node) return;
    const latest = atLatestOutput(node);
    setAway(!latest);
    if (latest) setUnreadReply(false);
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
    pendingPosition.current = positionKey ? readPosition(positionKey) : null;
    restoringDetails.current = null;
    follow.current = !pendingPosition.current;
    setPinned(null);
    setAway(false);
    setUnreadReply(false);
    previousReply.current = undefined;
  }, [positionKey, session?.id]);
  useLayoutEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const saved = pendingPosition.current;
    const { projected, order, rows } = agent.view;
    if (projected) {
      let latestReply: SessionViewRow | null = null;
      for (let index = order.length - 1; index >= 0; index--) {
        const row = rows[order[index]];
        if (row?.kind === "assistant" && row.text.trim()) {
          latestReply = row;
          break;
        }
      }
      const previous = previousReply.current;
      if (
        !saved &&
        !follow.current &&
        !atLatestOutput(node) &&
        !unreadReply &&
        previous !== undefined &&
        latestReply &&
        (previous?.id !== latestReply.id || previous.text !== latestReply.text)
      ) {
        setUnreadReply(true);
        savePosition(true);
      }
      previousReply.current = latestReply;
    }
    // Replay cursors belong to a resource binding. A rebound session starts a new stream.
    if (
      saved &&
      agent.view.projected &&
      (saved.resource !== session?.id || agent.view.cursor >= saved.cursor)
    ) {
      const turn = Array.from(
        node.querySelectorAll<HTMLElement>("[data-reading-turn]"),
      ).find((element) => element.dataset.readingTurn === saved.turn);
      pendingPosition.current = null;
      if (turn) {
        setUnreadReply(saved.unreadReply === true);
        const worked = turn.querySelector<HTMLDetailsElement>(
          ":scope > details.fq-agent-work",
        );
        if (worked && saved.workedOpen && !worked.open) {
          restoringDetails.current = worked;
          worked.open = true;
        }
        const offset = Math.max(
          -node.clientHeight,
          Math.min(saved.offset, turn.offsetHeight - 1),
        );
        node.scrollTop +=
          turn.getBoundingClientRect().top -
          node.getBoundingClientRect().top +
          offset;
      } else {
        follow.current = true;
        writePosition(positionKey, null);
      }
    }
    if (follow.current) node.scrollTop = node.scrollHeight;
    measure();
  }, [
    agent.view,
    agent.pendingDelivery,
    agent.sending,
    measure,
    positionKey,
    savePosition,
    session?.id,
    unreadReply,
  ]);
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
  const rawQuestionText =
    pinned !== null && agent.view.rows[pinned]
      ? splitWorkspaceContext(agent.view.rows[pinned].text).text
      : "";
  const questionText =
    iterationQuestion(rawQuestionText)?.summary || rawQuestionText;
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
            savePosition(unreadReply);
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
        onScroll={(event) => {
          if (pendingPosition.current) return;
          follow.current = atLatestOutput(event.currentTarget);
          measure();
          savePosition(unreadReply);
        }}
        role="log"
        tabIndex={-1}
        aria-label="Agent conversation"
        aria-relevant="additions"
      >
        <div ref={content}>
          {turns.map((turn, turnIndex) => {
            const { progress, children } = turn;
            const live = turn.active || children.some(childRunning);
            const progressPanel = (
              <AgentProgress
                todos={progress?.todos}
                active={turn.active}
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
                  onOpenRun={bridge.inspectRun}
                  completedTurn={!live && turn.outcome === "completed"}
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
            const workRows = turn.work.filter((row) => row.kind !== "subagent");
            const question = turn.visible.filter((row) => row.kind === "user");
            const remaining = turn.visible.filter((row) => row.kind !== "user");
            const duration = workDuration(turn.durationMs);
            const liveSummary = liveActivitySummary(
              turn.rows,
              turn.active ? runStatus : "Running subagents",
              progress?.todos?.find((item) => item.status === "in_progress")
                ?.content,
            );
            const actions = bridge.actions.filter(
              (action) =>
                action.origin !== "ui" &&
                actionBelongsToTurn(
                  action.turn_seq,
                  turn.rows.find((row) => row.kind === "user")?.seq,
                  turns[turnIndex + 1]?.rows.find((row) => row.kind === "user")
                    ?.seq,
                ),
            );
            const deliveries = researchDeliveries(actions);
            const workspaceActivity = (
              <AgentWorkspaceActions
                actions={actions}
                jobs={jobs}
                onOpen={bridge.open}
                embedded={!live}
              />
            );
            return (
              <div
                key={turn.id}
                className="fq-agent-turn"
                data-reading-turn={
                  turn.rows[0]?.kind === "user" ? turn.rows[0].seq : undefined
                }
              >
                {question.map(renderRow)}
                {!!deliveries.length && (
                  <AgentResearchOutcome
                    key={deliveries.at(-1)}
                    id={deliveries.at(-1)!}
                    earlier={deliveries.slice(0, -1)}
                    goal={
                      splitWorkspaceContext(
                        turn.rows.find((row) => row.kind === "user")?.text ||
                          "",
                      ).text
                    }
                    onOpen={bridge.openResearch}
                    onPrepare={onPrepare}
                  />
                )}
                <AgentExperimentTask
                  actions={actions}
                  active={turn.active}
                  outcome={turn.outcome}
                  follow={bridge.follow}
                  requested={/比较|对比|对照|\bcompar(?:e|ison)\b/i.test(
                    splitWorkspaceContext(
                      turn.rows.find((row) => row.kind === "user")?.text || "",
                    ).text,
                  )}
                  onCompare={bridge.compare}
                  onInspect={bridge.inspectRun}
                  onCircuit={bridge.openCircuit}
                  onPrepare={onPrepare}
                  researchTurns={researchTurns}
                />
                {live && progressPanel}
                {(live ||
                  workRows.length > 0 ||
                  (!live && (hasProgress || actions.length > 0))) && (
                  <details
                    className={
                      live
                        ? "fq-agent-work fq-agent-work-live"
                        : "fq-agent-work"
                    }
                    onToggle={(event) => {
                      const details = event.currentTarget;
                      if (restoringDetails.current === details) {
                        restoringDetails.current = null;
                        return;
                      }
                      if (!details.open) {
                        savePosition(unreadReply);
                        return;
                      }
                      const node = viewport.current;
                      const header = details.firstElementChild;
                      if (!node || !header) return;
                      const visible = node.getBoundingClientRect();
                      const heading = header.getBoundingClientRect();
                      const previewBottom = Math.min(
                        details.getBoundingClientRect().bottom,
                        heading.bottom + 96,
                      );
                      // Keep the disclosure heading below the pinned question.
                      const reveal = Math.min(
                        previewBottom - visible.bottom + 12,
                        heading.top - visible.top - 40,
                      );
                      if (reveal > 0) node.scrollTop += reveal;
                      measure();
                      savePosition(unreadReply);
                    }}
                  >
                    <summary
                      onClick={() => {
                        follow.current = false;
                      }}
                    >
                      {live ? (
                        <span className="fq-live-activity-summary">
                          <strong>{liveSummary.label}</strong>
                          {liveSummary.detail && (
                            <span
                              className="fq-live-activity-preview"
                              aria-label="Current activity"
                            >
                              {liveSummary.detail}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span>
                          {"Worked" + (duration ? " for " + duration : "")}
                        </span>
                      )}
                      <span className="fq-agent-work-count">
                        {turn.toolCount > 0
                          ? `${turn.toolCount} tool ${turn.toolCount === 1 ? "call" : "calls"}`
                          : hasProgress || actions.length > 0
                            ? "Task activity"
                            : "Thought"}
                      </span>
                      {!live &&
                        turn.outcome &&
                        turn.outcome !== "completed" && (
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
                      {!live && progressPanel}
                      {live && !workRows.length && (
                        <p className="fq-live-activity-empty">
                          No tool activity reported yet.
                        </p>
                      )}
                      {workRows.map(renderRow)}
                      {!live && workspaceActivity}
                    </div>
                  </details>
                )}
                {remaining.map(renderRow)}
                {live && workspaceActivity}
              </div>
            );
          })}
          {agent.pendingDelivery && (
            <article
              className="fq-agent-message user"
              aria-label="Pending message"
            >
              <AgentMarkdown text={agent.pendingDelivery.draft} />
              <div className="fq-agent-delivery" role="status">
                <span>
                  {agent.sending
                    ? "Sending…"
                    : canRetryDelivery(agent.pendingDelivery)
                      ? "Not delivered"
                      : "Delivery unconfirmed"}
                </span>
                <p>
                  {agent.pendingDelivery.reason ||
                    (canRetryDelivery(agent.pendingDelivery)
                      ? "The Agent service did not accept this message. Your draft is retained."
                      : "Checking the original send ID. This message will not be resent automatically.")}
                </p>
                {!agent.sending && canRetryDelivery(agent.pendingDelivery) && (
                  <div className="fq-agent-delivery-actions">
                    <button
                      disabled={
                        !deliveryReady ||
                        agent.pendingDelivery.session !== agent.session?.id
                      }
                      onClick={() => void agent.retryDelivery()}
                    >
                      Retry original message
                    </button>
                    <button onClick={agent.dismissDelivery}>Dismiss</button>
                  </div>
                )}
              </div>
            </article>
          )}
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
            <div className="fq-agent-live">
              <div className="fq-agent-live-status" role="status">
                <span aria-hidden="true" className="fq-activity-marker active">
                  ◌
                </span>{" "}
                <span>{runStatus}</span>
                {activity && (
                  <span className="fq-agent-live-activity" title={activity}>
                    · {activity}
                  </span>
                )}
              </div>
              {startedAt !== undefined &&
                Number.isFinite(startedAt) &&
                startedAt > 0 && <AgentElapsedTime startedAt={startedAt} />}
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
          title={unreadReply ? "New reply" : "Latest output"}
          aria-description={unreadReply ? "New reply available" : undefined}
          data-unread={unreadReply || undefined}
          onClick={() => {
            follow.current = true;
            if (viewport.current)
              viewport.current.scrollTop = viewport.current.scrollHeight;
            measure();
            savePosition(unreadReply);
            viewport.current?.focus({ preventScroll: true });
          }}
        >
          <span aria-hidden="true">↓</span>
        </button>
      )}
    </div>
  );
}
