import { useRef, useState } from "react";
import type { SessionCatalogResource } from "../../../../packages/sdk/index.d.ts";
import { Modal } from "./Modal";
import { CloseButton } from "./CloseButton";
import { useAgentHistory } from "../hooks/useAgentHistory";
import {
  filterSessionHistory,
  sessionResumeBlock,
  historyActionBlock,
} from "../state/agent-history";
import type { AgentConversation } from "../hooks/useAgentConversation";
export function AgentHistory({
  agent,
  onClose,
}: {
  agent: AgentConversation;
  onClose: () => void;
}) {
  const history = useAgentHistory(),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState(""),
    [showTrash, setShowTrash] = useState(false),
    [editing, setEditing] = useState<{
      item: SessionCatalogResource;
      title: string;
    } | null>(null),
    [deleting, setDeleting] = useState<SessionCatalogResource | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const locked =
    agent.busy ||
    agent.sending ||
    agent.view.working ||
    !!Object.keys(agent.view.permissions).length ||
    !!Object.keys(agent.view.questions).length;
  const key = (s: { backendId: string; sessionId: string }) =>
    JSON.stringify([s.backendId, s.sessionId]);
  const hidden = new Set(history.trash.map(key)),
    all = filterSessionHistory(history.sessions, "", agent.cwd);
  const sessions = filterSessionHistory(all, query, agent.cwd).filter(
      (item) => hidden.has(key(item)) === showTrash,
    ),
    chosen = sessions.find((s) => key(s) === selected);
  const rename = async () => {
    if (
      editing &&
      !historyActionBlock(editing.item, agent.session, locked, "rename") &&
      editing.title.trim() &&
      (await history.rename(editing.item, editing.title))
    )
      setEditing(null);
  };
  return (
    <Modal
      className="fq-agent-settings-dialog fq-agent-history-dialog"
      label="Resume Agent session"
      onClose={onClose}
      initialFocus={search}
    >
      <header>
        <h2>Conversations</h2>
        <CloseButton label="Close session history" onClick={onClose} />
      </header>
      <p>
        Native FlagQAI history for this workspace. Switching preserves the model
        editor and its draft.
      </p>
      <nav aria-label="History views">
        <button
          aria-pressed={!showTrash}
          className={!showTrash ? "selected" : ""}
          onClick={() => {
            setShowTrash(false);
            setSelected("");
            setEditing(null);
          }}
        >
          History
        </button>
        <button
          aria-pressed={showTrash}
          className={showTrash ? "selected" : ""}
          onClick={() => {
            setShowTrash(true);
            setSelected("");
            setEditing(null);
          }}
        >
          Trash ({all.filter((item) => hidden.has(key(item))).length})
        </button>
      </nav>
      {showTrash && (
        <p>
          Web Trash hides entries from this workspace's History. Original
          FlagQAI records remain intact; restore them here.
        </p>
      )}
      <div className="fq-history-search">
        <label>
          Search conversations
          <input
            ref={search}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Title, model, backend or session ID"
          />
        </label>
        <button
          disabled={history.loading || history.mutating}
          onClick={() => void history.refresh()}
        >
          Refresh history
        </button>
      </div>
      {(history.error || agent.error) && (
        <p role="alert" className="fq-settings-error">
          {history.error || agent.error}
        </p>
      )}
      {history.notice && <p role="status">{history.notice}</p>}
      {history.loading && <p role="status">Loading native session history…</p>}
      {locked && (
        <p role="status">
          Finish the current turn and pending decisions before changing
          conversations.
        </p>
      )}
      <div
        className="fq-history-list"
        role="radiogroup"
        aria-label="Previous Agent conversations"
      >
        {sessions.map((item) => {
          const reason = showTrash
              ? "Restore this conversation before resuming."
              : sessionResumeBlock(item, agent.session, locked),
            renameReason = historyActionBlock(
              item,
              agent.session,
              locked,
              "rename",
            ),
            trashReason = historyActionBlock(
              item,
              agent.session,
              locked,
              showTrash ? "restore" : "trash",
            ),
            isEditing = editing && key(editing.item) === key(item);
          return (
            <div key={key(item)} className="fq-history-row">
              <label className={reason ? "unavailable" : ""} title={reason}>
                <input
                  type="radio"
                  name="resume-agent-session"
                  aria-label={
                    item.title + " · " + item.backendId + " · " + item.sessionId
                  }
                  disabled={!!reason || history.loading || history.mutating}
                  checked={selected === key(item)}
                  onChange={() => setSelected(key(item))}
                />
                <span>
                  <strong>{item.title || "Untitled conversation"}</strong>
                  <small>
                    {item.backendId}
                    {item.model ? " · " + item.model : ""}
                    {item.branch ? " · " + item.branch : ""} · {item.kind}
                  </small>
                  <small>
                    {item.updatedAt
                      ? new Date(item.updatedAt).toLocaleString()
                      : "Update time unavailable"}{" "}
                    · <code>{item.sessionId}</code>
                  </small>
                  {reason && <small>{reason}</small>}
                </span>
              </label>
              {isEditing ? (
                <div className="fq-history-rename">
                  <input
                    autoFocus
                    aria-label="Conversation name"
                    maxLength={256}
                    value={editing.title}
                    disabled={history.mutating}
                    onChange={(e) =>
                      setEditing({ ...editing, title: e.target.value })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        void rename();
                      }
                    }}
                  />
                  <button
                    disabled={history.mutating}
                    onClick={() => setEditing(null)}
                  >
                    Cancel rename
                  </button>
                  <button
                    disabled={
                      !!renameReason ||
                      history.mutating ||
                      !editing.title.trim()
                    }
                    onClick={() => void rename()}
                  >
                    Save name
                  </button>
                </div>
              ) : (
                <div className="fq-history-actions">
                  <button
                    disabled={
                      !!renameReason || history.mutating || history.loading
                    }
                    title={renameReason}
                    aria-label={"Rename " + item.title}
                    onClick={() => {
                      agent.clearError();
                      setEditing({ item, title: item.title });
                    }}
                  >
                    Rename
                  </button>
                  {showTrash ? (
                    <button
                      disabled={!!trashReason || history.mutating}
                      title={trashReason}
                      aria-label={"Restore " + item.title}
                      onClick={() => void history.setTrashed(item, false)}
                    >
                      Restore
                    </button>
                  ) : (
                    <button
                      className="danger-text"
                      disabled={
                        !!trashReason || history.mutating || history.loading
                      }
                      title={trashReason}
                      aria-label={"Delete " + item.title}
                      onClick={() => {
                        agent.clearError();
                        setDeleting(item);
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!history.loading && !history.error && !sessions.length && (
          <p>
            {query
              ? "No matching conversations."
              : showTrash
                ? "Trash is empty."
                : "No saved conversations in this workspace yet."}
          </p>
        )}
      </div>
      <footer>
        <button onClick={onClose}>Close</button>
        {!showTrash && (
          <button
            className="primary"
            disabled={
              !chosen ||
              !!sessionResumeBlock(chosen, agent.session, locked) ||
              history.loading ||
              history.mutating
            }
            onClick={async () => {
              if (chosen && (await agent.choose(chosen))) onClose();
            }}
          >
            Resume selected session
          </button>
        )}
      </footer>
      {deleting && (
        <Modal
          className="fq-agent-settings-dialog fq-history-confirm"
          label="Confirm conversation deletion"
          onClose={() => {
            if (!history.mutating) setDeleting(null);
          }}
        >
          <header>
            <h2>Move conversation to Trash?</h2>
            <CloseButton
              label="Cancel deletion"
              onClick={() => setDeleting(null)}
            />
          </header>
          <p>
            <strong>{deleting.title}</strong>
          </p>
          <p>
            This removes the entry from Web History. Its original FlagQAI record
            is preserved, and you can restore it from Trash.
          </p>
          <small>{deleting.sessionId}</small>
          {history.error && (
            <p role="alert" className="fq-settings-error">
              {history.error}
            </p>
          )}
          <footer>
            <button
              disabled={history.mutating}
              onClick={() => setDeleting(null)}
            >
              Cancel
            </button>
            <button
              className="danger-text"
              disabled={
                history.mutating ||
                !!historyActionBlock(deleting, agent.session, locked, "trash")
              }
              onClick={async () => {
                if (await history.setTrashed(deleting, true)) {
                  setDeleting(null);
                  setSelected("");
                }
              }}
            >
              Move to Trash
            </button>
          </footer>
        </Modal>
      )}
    </Modal>
  );
}
