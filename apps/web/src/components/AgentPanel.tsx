import type { PlatformBridge } from "../hooks/usePlatformBridge";
import type { QuantumJob } from "../contracts/quantum-workspace";
import {
  attachmentMessage,
  platformMessage,
  consumeAttachments,
  attachmentSnapshot,
  referenceQuery,
  restoreAttachments,
  ATTACHMENT_KEY,
  type AgentAttachment,
} from "../state/agent-attachments";
import { Modal } from "./Modal";
import { CloseButton } from "./CloseButton";
import { CodeExample } from "./CodeExample";
import { useAgentSubagents } from "../hooks/useAgentSubagents";
import { dockChildren } from "../state/agent-progress";
import { AgentSubagentDock } from "./AgentSubagentDock";
import { useAutoGrowTextarea } from "../hooks/useAutoGrowTextarea";
import { useEffect, useRef, useState } from "react";
import type { AgentConversation } from "../hooks/useAgentConversation";
import { AgentCommandMenu, COMMAND_MENU_ID } from "./AgentCommandMenu";
import {
  commandQuery,
  matchCommands,
  exactCommand,
  type AgentCommand,
} from "../state/agent-commands";
import { AgentHistory } from "./AgentHistory";
import { AgentSettings } from "./AgentSettings";
import { AgentAutoCompaction } from "./AgentAutoCompaction";
import { AgentContextUsage } from "./AgentContextUsage";
import { AgentTranscript } from "./AgentTranscript";
import type { PythonRepairRequest } from "../state/python-failure";
const DRAFT_KEY = "fq-agent-prompt-draft-v1";
const suggestions = [
  {
    title: "Explain this circuit",
    detail: "Gates, registers and what they do",
    icon: "circuit",
    prompt:
      "Explain the current circuit step by step, including its registers and gate hierarchy.",
  },
  {
    title: "Review the model",
    detail: "Check assumptions and suggest improvements",
    icon: "code",
    prompt:
      "Review the current model. Explain potential issues and suggest changes before applying them.",
  },
  {
    title: "Plan an experiment",
    detail: "Turn a question into a quantum workflow",
    icon: "experiment",
    prompt:
      "Help me plan an experiment with the current model, including parameters, execution settings and expected results.",
  },
];
function TaskIcon({ name }: { name: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === "code" ? (
        <path d="m6 5-4 5 4 5m8-10 4 5-4 5m-3-12-2 14" />
      ) : name === "circuit" ? (
        <>
          <path d="M2 6h16M2 14h16M13 6v8" />
          <rect x="5" y="3" width="5" height="6" rx="1" fill="#2d2d30" />
          <circle cx="13" cy="14" r="2.5" fill="#2d2d30" />
          <path d="M13 12v4m-2-2h4" />
        </>
      ) : (
        <>
          <path d="M7 2h6m-5 0v6l-5 8a1.2 1.2 0 0 0 1 2h12a1.2 1.2 0 0 0 1-2l-5-8V2M6 12h8" />
          <path d="M8 15h1m3 0h1" />
        </>
      )}
    </svg>
  );
}
export function AgentPanel({
  name,
  source,
  contextLabel = "CURRENT MODEL",
  language = "qasm",
  agent,
  bridge,
  jobs,
  editorFile,
  onClose,
  references = [],
  pendingAttachment,
  pendingRepair,
  onRepairConsumed,
  onAttachmentConsumed,
}: {
  name: string;
  source: string;
  contextLabel?: string;
  language?: "qasm" | "python";
  agent: AgentConversation;
  bridge: PlatformBridge;
  jobs: QuantumJob[];
  editorFile?: string;
  onClose: () => void;
  references?: AgentAttachment[];
  pendingAttachment?: AgentAttachment;
  pendingRepair?: PythonRepairRequest;
  onRepairConsumed?: () => void;
  onAttachmentConsumed?: () => void;
}) {
  const roster = useAgentSubagents(
    agent.session?.id,
    agent.phase === "connected",
  );
  const children = dockChildren(agent.view, roster);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [autoCompactionOpen, setAutoCompactionOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"models" | "providers" | null>(
    null,
  );
  const [inputFocused, setInputFocused] = useState(false),
    [commandDismissed, setCommandDismissed] = useState(false),
    [commandIndex, setCommandIndex] = useState(0);
  const [details, setDetails] = useState(false),
    [draft, setDraft] = useState(() => {
      try {
        return (localStorage.getItem(DRAFT_KEY) || "").slice(0, 6000);
      } catch {
        return "";
      }
    }),
    [saved, setSaved] = useState(true),
    [copied, setCopied] = useState(false);
  const [attachments, setAttachments] = useState<AgentAttachment[]>(() => {
    try {
      return restoreAttachments(localStorage.getItem(ATTACHMENT_KEY));
    } catch {
      return [];
    }
  });
  const [attachmentError, setAttachmentError] = useState("");
  const [preview, setPreview] = useState<AgentAttachment | null>(null);
  const [repairOffer, setRepairOffer] = useState<PythonRepairRequest | null>(
    null,
  );
  const consumedRepair = useRef<string | null>(null);
  const applyRepair = (request: PythonRepairRequest) => {
    if (attachments.length >= 4) {
      setAttachmentError(
        "Remove a code reference before adding the failed run. The repair request has not been inserted.",
      );
      return;
    }
    addAttachment(request.attachment);
    setDraft((current) =>
      current.trim() ? current + "\n\n" + request.prompt : request.prompt,
    );
    setAttachmentError("");
    setRepairOffer(null);
    onRepairConsumed?.();
    input.current?.focus();
  };
  const [caret, setCaret] = useState(draft.length);
  const [referenceIndex, setReferenceIndex] = useState(0);
  const [referenceDismissed, setReferenceDismissed] = useState(false);
  const consumed = useRef<string | null>(null);
  const addAttachment = (item: AgentAttachment) =>
    setAttachments((previous) =>
      previous.some((value) => value.id === item.id) || previous.length >= 4
        ? previous
        : [...previous, attachmentSnapshot(item)],
    );
  useEffect(() => {
    try {
      localStorage.setItem(ATTACHMENT_KEY, JSON.stringify(attachments));
    } catch {
      /* Draft stays in memory. */
    }
  }, [attachments]);
  useEffect(() => {
    if (!pendingAttachment || consumed.current === pendingAttachment.id) return;
    consumed.current = pendingAttachment.id;
    if (
      attachments.length >= 4 &&
      !attachments.some((item) => item.id === pendingAttachment.id)
    )
      setAttachmentError(
        "Attach up to four code snapshots. Remove one, then send the selection again.",
      );
    addAttachment(pendingAttachment);
    onAttachmentConsumed?.();
    input.current?.focus();
  }, [pendingAttachment]);
  useEffect(() => {
    if (!pendingRepair || consumedRepair.current === pendingRepair.id) return;
    if (attachments.length >= 4) {
      setAttachmentError(
        "Remove a code reference to attach the failed Python run. Your chat draft is unchanged.",
      );
      return;
    }
    consumedRepair.current = pendingRepair.id;
    if (draft.trim()) setRepairOffer(pendingRepair);
    else applyRepair(pendingRepair);
  }, [pendingRepair, attachments.length]);
  const mention = referenceQuery(draft, caret);
  const candidates = [
    {
      id: "current",
      name: name + (language === "python" ? ".py" : ".qasm"),
      language,
      source,
      kind:
        contextLabel === "CURRENT PROGRAM"
          ? ("program" as const)
          : ("model" as const),
      workspaceFile: editorFile,
    },
    ...references,
  ];
  const matches = candidates
    .filter(
      (item) =>
        !mention?.query ||
        (
          item.name.toLowerCase() +
          " " +
          (item.id === "current"
            ? "current model program 当前模型 当前电路"
            : "")
        ).includes(mention.query),
    )
    .slice(0, 8);
  const referenceOpen =
    inputFocused &&
    !!mention &&
    !referenceDismissed &&
    !settingsTab &&
    !historyOpen;
  const chooseReference = (item: AgentAttachment) => {
    if (!mention) return;
    if (
      attachments.length >= 4 &&
      !attachments.some((value) => value.id === item.id)
    ) {
      setAttachmentError(
        "Attach up to four code snapshots. Remove one to add another.",
      );
      return;
    }
    setAttachmentError("");
    addAttachment(item);
    const next = draft.slice(0, mention.start) + draft.slice(mention.end);
    setDraft(next);
    setCaret(mention.start);
    setReferenceDismissed(true);
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(mention.start, mention.start);
    });
  };
  const input = useRef<HTMLTextAreaElement>(null),
    copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    composing = useRef(false);
  useAutoGrowTextarea(input, draft);
  useEffect(() => {
    if (agent.confirmedDraft !== null)
      setDraft((current) => (current === agent.confirmedDraft ? "" : current));
  }, [agent.confirmedDraft]);
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, draft);

      setSaved(true);
    } catch {
      setSaved(false);
    }
  }, [draft]);
  useEffect(() => () => clearTimeout(copyTimer.current), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2500);
    } catch {
      input.current?.focus();
      input.current?.select();
    }
  };
  const pending =
    Object.keys(agent.view.permissions).length +
    Object.keys(agent.view.questions).length;
  const ready = agent.phase === "connected" && agent.view.projected;
  const localCommand = exactCommand(draft);
  const slashQuery = commandQuery(draft);
  const commands = matchCommands(draft);
  const selectedIndex = Math.min(
    commandIndex,
    Math.max(0, commands.length - 1),
  );
  const menuOpen =
    inputFocused &&
    slashQuery !== null &&
    !commandDismissed &&
    !settingsTab &&
    !historyOpen;
  const commandDisabled = (command: AgentCommand) =>
    command.tab === "new" &&
    (!agent.cwd ||
      agent.busy ||
      agent.sending ||
      agent.view.working ||
      pending > 0)
      ? !agent.cwd
        ? "Connect to FlagQAI first."
        : "Finish the current turn and pending decisions first."
      : undefined;
  const selectCommand = async (command: AgentCommand) => {
    if (commandDisabled(command)) return;
    const original = draft;
    if (command.tab === "new") {
      if (await agent.choose()) {
        setDraft((value) => (value === original ? "" : value));
        setCommandDismissed(true);
      }
      return;
    }
    setCommandDismissed(true);
    if (command.tab === "resume") {
      agent.clearError();
      setHistoryOpen(true);
    } else setSettingsTab(command.tab);
    setDraft("");
  };
  const canSend =
    (!!localCommand && !commandDisabled(localCommand)) ||
    (commandQuery(draft.trim()) === null &&
      ready &&
      !agent.view.working &&
      !agent.sending &&
      !agent.pendingDelivery &&
      !pending &&
      !agent.busy &&
      !agent.view.context?.compaction &&
      !!draft.trim());
  const submit = async () => {
    if (localCommand) {
      selectCommand(localCommand);
      return;
    }
    if (!canSend) return;
    const submitted = draft;
    const snapshot = attachments;
    const text = platformMessage(
      attachmentMessage(submitted, snapshot),
      bridge.controls,
    );
    if (await agent.send(text, submitted)) {
      setDraft((current) => (current === submitted ? "" : current));
      setAttachments((current) => consumeAttachments(current, snapshot));
    }
  };
  const hasThread =
    agent.view.order.length > 0 || pending > 0 || agent.view.working;
  const running = agent.view.working || agent.sending;
  return (
    <section className="fq-agent-panel" aria-label="FlagQAI Agent workspace">
      {repairOffer && (
        <Modal
          className="fq-attachment-preview"
          label="Add Python repair request"
          onClose={() => {
            setRepairOffer(null);
            onRepairConsumed?.();
          }}
        >
          <header>
            <h2>Add Python repair request</h2>
            <CloseButton
              label="Close repair request"
              onClick={() => {
                setRepairOffer(null);
                onRepairConsumed?.();
              }}
            />
          </header>
          <p>
            Your chat draft is already filled. Keep it and append the repair
            instructions with the failed source and logs, or cancel without
            changing it.
          </p>
          <p>{repairOffer.attachment.failure?.summary}</p>
          <footer>
            <button
              onClick={() => {
                setRepairOffer(null);
                onRepairConsumed?.();
              }}
            >
              Cancel
            </button>
            <button
              className="primary"
              onClick={() => applyRepair(repairOffer)}
            >
              Append repair request
            </button>
          </footer>
        </Modal>
      )}
      {autoCompactionOpen && (
        <AgentAutoCompaction
          key={agent.session?.id}
          agent={agent}
          onClose={() => setAutoCompactionOpen(false)}
        />
      )}
      {historyOpen && (
        <AgentHistory agent={agent} onClose={() => setHistoryOpen(false)} />
      )}
      {settingsTab && (
        <AgentSettings
          agent={agent}
          initialTab={settingsTab}
          onClose={() => setSettingsTab(null)}
        />
      )}
      <div className="fq-pane-title">
        <span>
          FlagQAI{" "}
          {agent.view.model && (
            <button
              className="fq-agent-model-label"
              title={agent.view.model}
              aria-label="Choose Agent model"
              onClick={() => setSettingsTab("models")}
            >
              {agent.view.model} ⌄
            </button>
          )}
        </span>
        <button
          className="fq-agent-models"
          aria-label="Show model library"
          onClick={onClose}
        >
          {contextLabel === "CURRENT PROGRAM" ? "Programs" : "Models"} ↗
        </button>
      </div>
      <div className="fq-agent-session-controls">
        <button
          className={"fq-agent-connection-status " + (ready ? "available" : "")}
          disabled={agent.busy}
          aria-label={
            agent.phase === "connected" ? "Reconnect Agent" : "Connect Agent"
          }
          title={
            (agent.compacting || agent.view.context?.compaction
              ? "Compacting…"
              : agent.busy
                ? "Connecting…"
                : agent.phase === "reconnecting"
                  ? "Reconnecting…"
                  : ready
                    ? pending
                      ? "Needs attention"
                      : running
                        ? "Working"
                        : "Connected"
                    : "Not connected") +
            " · Click to " +
            (agent.phase === "connected" ? "reconnect" : "connect")
          }
          onClick={() => void agent.connect()}
        >
          <span
            role="status"
            aria-label={
              ready
                ? pending
                  ? "Needs attention"
                  : running
                    ? "Working"
                    : "Connected"
                : "Not connected"
            }
          >
            <i className={agent.busy || running ? "active" : ""} />
            {!ready && (
              <span>
                {agent.busy
                  ? "Connecting…"
                  : agent.phase === "reconnecting"
                    ? "Retrying…"
                    : "Connect"}
              </span>
            )}
          </span>
        </button>
        <button
          aria-label="Models and providers"
          className="fq-agent-settings-control"
          title="Models and providers · /model · /provider"
          onClick={() => setSettingsTab("models")}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            aria-hidden="true"
          >
            <path d="m8 2-.5 2-2 .9-1.9-.5-2 3.4 1.4 1.5v2l-1.4 1.5 2 3.4 1.9-.5 2 .9.5 2h4l.5-2 2-.9 1.9.5 2-3.4-1.4-1.5v-2L18 7.9l-2-3.4-1.9.5-2-.9-.5-2Z" />
            <circle cx="10" cy="10" r="3" />
          </svg>
        </button>
        <select
          aria-label="Agent backend"
          value={agent.backend}
          disabled={!!agent.session || agent.busy}
          onChange={(event) => agent.setBackend(event.target.value)}
        >
          {agent.backends.length ? (
            agent.backends.map((backend) => (
              <option key={backend.id} value={backend.id}>
                {backend.label || backend.id}
              </option>
            ))
          ) : (
            <option value="dsh">FlagQAI Harness</option>
          )}
        </select>
        <button
          disabled={!agent.cwd || agent.busy || running || !!pending}
          onClick={() => void agent.choose()}
        >
          New chat
        </button>
        <button
          aria-label="Resume Agent session"
          title="History · /resume"
          onClick={() => {
            agent.clearError();
            setHistoryOpen(true);
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 9a7 7 0 1 1 2 6M3 4v5h5m2-3v4l3 2" />
          </svg>
        </button>
      </div>
      {agent.pendingDelivery && !agent.sending && (
        <div className="fq-agent-error" role="status">
          <span>
            {ready && agent.pendingDelivery.session !== agent.session?.id
              ? "The native session resource changed. Check its history before starting a new chat; this message will not be resent."
              : "Message delivery is unconfirmed. Check the conversation before retrying; refresh will not resend it."}
          </span>
          <button
            disabled={
              !ready ||
              running ||
              !!pending ||
              agent.busy ||
              agent.pendingDelivery.session !== agent.session?.id
            }
            onClick={async () => {
              const original = agent.pendingDelivery;
              if (original && (await agent.retryDelivery()))
                setDraft((current) =>
                  current === original.draft ? "" : current,
                );
            }}
          >
            Retry original message
          </button>
        </div>
      )}
      {agent.error && (
        <div className="fq-agent-error" role="alert">
          <span>{agent.error}</span>
          <button aria-label="Dismiss Agent error" onClick={agent.clearError}>
            ×
          </button>
        </div>
      )}
      {hasThread ? (
        <AgentTranscript
          agent={agent}
          roster={roster}
          bridge={bridge}
          jobs={jobs}
        />
      ) : (
        <div
          className="fq-agent-body"
          role="log"
          aria-label="Agent conversation"
        >
          <div className="fq-agent-empty-thread">
            <div className="fq-agent-welcome">
              <h2>
                {["connecting", "reconnecting"].includes(agent.phase)
                  ? "Restoring your conversation…"
                  : "How can I help?"}
              </h2>
              <p>
                {["connecting", "reconnecting"].includes(agent.phase)
                  ? "Waiting for native session history. An existing task may still be running; no message is being resent."
                  : "Ask about your model, explore a circuit, or work through an idea."}
              </p>
            </div>
            {!["connecting", "reconnecting"].includes(agent.phase) && (
              <div className="fq-agent-suggestions">
                <small>TRY A QUESTION</small>
                {suggestions.map((task) => (
                  <button
                    key={task.title}
                    onClick={() => {
                      setDraft((previous) =>
                        previous.trim()
                          ? previous + "\n\n" + task.prompt
                          : task.prompt,
                      );
                      input.current?.focus();
                    }}
                  >
                    <span className="fq-agent-task-icon">
                      <TaskIcon name={task.icon} />
                    </span>
                    <span>
                      <b>{task.title}</b>
                      <small>{task.detail}</small>
                    </span>
                    <span className="fq-agent-task-arrow" aria-hidden="true">
                      ↗
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {preview && (
        <Modal
          className="fq-attachment-preview"
          label="Attachment preview"
          onClose={() => setPreview(null)}
        >
          <header>
            <h2>{preview.name}</h2>
            <CloseButton
              label="Close attachment preview"
              onClick={() => setPreview(null)}
            />
          </header>
          <p>
            Snapshot attached to your next message
            {preview.truncated ? " · Source truncated" : ""}
          </p>
          <CodeExample
            title={preview.name}
            code={preview.source}
            language={preview.language || "qasm"}
          />
          {preview.failure && (
            <>
              <p>
                Failed run {preview.failure.runId} ·{" "}
                {preview.failure.sourceHash} · {preview.failure.summary}
              </p>
              <CodeExample
                title={
                  "Failure logs" +
                  (preview.failure.logsTruncated ? " (tail, truncated)" : "")
                }
                code={preview.failure.logs}
                language="plain"
              />
            </>
          )}
        </Modal>
      )}
      <div className="fq-agent-composer">
        {attachmentError && (
          <small role="status" className="fq-attachment-warning">
            {attachmentError}
          </small>
        )}
        {referenceOpen && (
          <div
            className="fq-reference-menu"
            role="listbox"
            aria-label="Attach code reference"
            id="fq-reference-menu"
          >
            {matches.map((item, index) => (
              <button
                key={item.id}
                role="option"
                aria-selected={index === referenceIndex}
                id={"fq-reference-option-" + index}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setReferenceIndex(index)}
                onClick={() => chooseReference(item)}
              >
                <span>
                  {item.id === "current"
                    ? "Current " +
                      (item.kind === "program" ? "program" : "model")
                    : item.kind === "program"
                      ? "Program"
                      : "Saved model"}
                </span>
                <strong>{item.name}</strong>
              </button>
            ))}
            {!matches.length && <small>No matching models or programs.</small>}
          </div>
        )}

        {menuOpen && (
          <AgentCommandMenu
            commands={commands}
            selected={selectedIndex}
            onSelect={(command) => void selectCommand(command)}
            disabledReason={commandDisabled}
            onHover={setCommandIndex}
          />
        )}
        <label className="fq-sr-only" htmlFor="fq-agent-request">
          Message FlagQAI
        </label>
        <div className="fq-agent-input">
          {attachments.length > 0 && (
            <div
              className="fq-agent-attachment-chips"
              aria-label="Attached code snapshots"
            >
              {attachments.map((item) => (
                <span className="fq-attachment-chip" key={item.id}>
                  <button
                    title="Preview attached source"
                    onClick={() => setPreview(item)}
                  >
                    <span aria-hidden="true">&lt;/&gt;</span> {item.name}
                  </button>
                  <button
                    aria-label={"Remove attachment " + item.name}
                    onClick={() =>
                      setAttachments((previous) =>
                        previous.filter((value) => value.id !== item.id),
                      )
                    }
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <textarea
            id="fq-agent-request"
            ref={input}
            rows={2}
            value={draft}
            maxLength={6000}
            aria-autocomplete="list"
            aria-controls={
              referenceOpen
                ? "fq-reference-menu"
                : menuOpen
                  ? COMMAND_MENU_ID
                  : undefined
            }
            aria-activedescendant={
              referenceOpen && matches[referenceIndex]
                ? "fq-reference-option-" + referenceIndex
                : menuOpen && commands[selectedIndex]
                  ? COMMAND_MENU_ID + "-" + commands[selectedIndex].name
                  : undefined
            }
            onFocus={() => setInputFocused(true)}
            onSelect={(event) => setCaret(event.currentTarget.selectionEnd)}
            onBlur={() => setInputFocused(false)}
            onChange={(event) => {
              setDraft(event.target.value);
              setCaret(event.target.selectionEnd);
              setReferenceIndex(0);
              setReferenceDismissed(false);
              setCopied(false);
              setCommandDismissed(false);
              setCommandIndex(0);
            }}
            onCompositionStart={() => {
              composing.current = true;
            }}
            onCompositionEnd={() => {
              composing.current = false;
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || composing.current) return;
              if (referenceOpen) {
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  setReferenceDismissed(true);
                  return;
                }
                if (["ArrowDown", "ArrowUp"].includes(event.key)) {
                  event.preventDefault();
                  setReferenceIndex((index) =>
                    matches.length
                      ? (index +
                          (event.key === "ArrowDown"
                            ? 1
                            : matches.length - 1)) %
                        matches.length
                      : 0,
                  );
                  return;
                }
                if (
                  (event.key === "Enter" || event.key === "Tab") &&
                  !event.shiftKey
                ) {
                  event.preventDefault();
                  if (matches[referenceIndex])
                    chooseReference(matches[referenceIndex]);
                  return;
                }
              }
              if (menuOpen) {
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  setCommandDismissed(true);
                  return;
                }
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  setCommandIndex(
                    commands.length
                      ? (selectedIndex +
                          (event.key === "ArrowDown"
                            ? 1
                            : commands.length - 1)) %
                          commands.length
                      : 0,
                  );
                  return;
                }
                if (
                  (event.key === "Enter" && !event.shiftKey) ||
                  (event.key === "Tab" && !event.shiftKey && commands.length)
                ) {
                  event.preventDefault();
                  const selected = commands[selectedIndex];
                  if (selected) {
                    if (event.key === "Tab") {
                      setDraft("/" + selected.name);
                      setCommandDismissed(true);
                    } else selectCommand(selected);
                  }
                  return;
                }
              }
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing &&
                !composing.current
              ) {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder="Ask FlagQAI about your quantum work…"
          />
          <div className="fq-agent-composer-actions">
            <button
              className="fq-attach-reference"
              aria-label="Attach code reference"
              title="Attach model or program · @"
              onClick={() => {
                const position = input.current?.selectionStart ?? draft.length;
                const prefix =
                  position && !/\s/.test(draft[position - 1]) ? " @" : "@";
                const next =
                  draft.slice(0, position) + prefix + draft.slice(position);
                setDraft(next);
                setCaret(position + prefix.length);
                setReferenceDismissed(false);
                setReferenceIndex(0);
                requestAnimationFrame(() => {
                  input.current?.focus();
                  input.current?.setSelectionRange(
                    position + prefix.length,
                    position + prefix.length,
                  );
                });
              }}
            >
              @
            </button>
            {running ? (
              <button
                className="fq-agent-send"
                disabled={agent.busy || agent.view.stop === "stopping"}
                onClick={() => void agent.stop()}
                aria-label="Stop Agent"
              >
                <svg
                  viewBox="0 0 20 20"
                  width="14"
                  height="14"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <rect x="4" y="4" width="12" height="12" rx="2" />
                </svg>
              </button>
            ) : (
              <button
                className="fq-agent-send"
                disabled={!canSend}
                onClick={() => void submit()}
                aria-label="Send message"
                title={
                  localCommand
                    ? "Open Agent settings"
                    : !ready
                      ? "Connect to FlagQAI to send"
                      : pending
                        ? "Answer the pending request first"
                        : "Send (Enter)"
                }
              >
                <svg
                  viewBox="0 0 20 20"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M10 16V4m-5 5 5-5 5 5" />
                </svg>
              </button>
            )}
          </div>
        </div>
        <div className="fq-agent-draft-meta">
          <AgentContextUsage
            view={agent.view}
            onCompact={() => void agent.compact()}
            onConfigure={() => setAutoCompactionOpen(true)}
            compacting={agent.compacting}
            disabled={
              !ready ||
              agent.busy ||
              running ||
              !!pending ||
              !!agent.view.context?.compaction
            }
          />
          <div className="fq-agent-follow-controls">
            <AgentSubagentDock
              children={children}
              sessionId={agent.session?.id}
            />
            <button
              role="switch"
              aria-checked={bridge.follow}
              title="Follow Agent navigation; existing drafts are preserved"
              onClick={() => bridge.setFollow(!bridge.follow)}
            >
              Follow Agent <span>{bridge.follow ? "On" : "Off"}</span>
            </button>
          </div>
          {saved && !agent.sending && !copied && (
            <small className="fq-sr-only">Draft saved locally</small>
          )}
          {(copied || agent.sending || !saved) && (
            <small role="status">
              {copied
                ? "Draft copied"
                : agent.sending
                  ? "Sending…"
                  : "Draft kept in this panel"}
            </small>
          )}
          <button
            className="link"
            aria-expanded={details}
            onClick={() => setDetails(!details)}
          >
            Connection
          </button>
        </div>
        {agent.compactionNotice && (
          <small className="fq-agent-compact-notice" role="status">
            {agent.compactionNotice}
          </small>
        )}
        {details && (
          <div className="fq-agent-connection-details">
            <p>{agent.cwd || "Workspace configuration unavailable"}</p>
            <code>flagqai serve --port 4096</code>
            <small>
              Sessions, tools and permissions are owned by the native Harness.
              Enter sends; Shift+Enter adds a line.
            </small>
            <button
              className="link"
              onClick={() => setSettingsTab("providers")}
            >
              Models & providers
            </button>
            <button
              className="fq-agent-copy"
              disabled={!draft.trim()}
              onClick={() => void copy()}
              aria-label="Copy agent request"
            >
              {copied ? "Copied ✓" : "Copy draft"}
            </button>
            {draft && (
              <button className="link" onClick={() => setDraft("")}>
                Clear draft
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
