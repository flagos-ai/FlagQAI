import { useEffect, useState } from "react";
import type { AgentConversation } from "../hooks/useAgentConversation";
import { useAutoCompaction } from "../hooks/useAutoCompaction";
import { Modal } from "./Modal";
import { CloseButton } from "./CloseButton";
export function AgentAutoCompaction({
  agent,
  onClose,
}: {
  agent: AgentConversation;
  onClose: () => void;
}) {
  const { policy, setPolicy, error } = useAutoCompaction(agent.session?.id);
  const [enabled, setEnabled] = useState(false),
    [threshold, setThreshold] = useState("80"),
    [saving, setSaving] = useState(false),
    [notice, setNotice] = useState("");
  useEffect(() => {
    if (policy) {
      setEnabled(policy.enabled);
      setThreshold(String(Math.round(policy.thresholdRatio * 100)));
    }
  }, [policy]);
  const locked =
    saving ||
    agent.busy ||
    agent.sending ||
    agent.view.working ||
    !!agent.view.context?.compaction ||
    !!Object.keys(agent.view.permissions).length ||
    !!Object.keys(agent.view.questions).length;
  const valid = /^\d+$/.test(threshold) && +threshold >= 50 && +threshold <= 95;
  const save = async () => {
    if (!policy || locked || !valid) return;
    setSaving(true);
    setNotice("");
    const updated = await agent.setCompactionPolicy({
      enabled,
      thresholdRatio: +threshold / 100,
    });
    if (updated) {
      setPolicy(updated);
      setNotice("Saved to this session's native policy.");
    } else setNotice("Not saved. Check the session status and retry.");
    setSaving(false);
  };
  return (
    <Modal
      className="fq-auto-compaction-dialog"
      label="Automatic context compaction"
      onClose={onClose}
    >
      <header>
        <h2>Automatic compaction</h2>
        <CloseButton label="Close compaction settings" onClick={onClose} />
      </header>
      <p>Current session · Native Harness policy</p>
      <div className="fq-auto-current">
        Current:{" "}
        {policy
          ? `${policy.enabled ? "On" : "Off"} · ${Math.round(policy.thresholdRatio * 100)}% ctx`
          : error
            ? "Unavailable"
            : "Loading…"}
      </div>
      {error && <p role="alert">{error}</p>}
      <label className="fq-auto-toggle">
        <span>Automatically compact context</span>
        <input
          type="checkbox"
          role="switch"
          aria-label="Automatic compaction"
          checked={enabled}
          disabled={!policy || locked}
          onChange={(event) => {
            setEnabled(event.target.checked);
            setNotice("");
          }}
        />
      </label>
      <label className="fq-auto-threshold">
        Trigger at ctx
        <input
          type="number"
          min="50"
          max="95"
          step="1"
          aria-label="Compaction threshold percent"
          value={threshold}
          disabled={!policy || locked}
          onChange={(event) => {
            setThreshold(event.target.value);
            setNotice("");
          }}
        />
        <span>%</span>
      </label>
      <small>
        50–95%. Checked before Agent steps; output reserves may trigger it
        earlier. Off disables automatic pressure and overflow compaction. Manual
        Compact stays available.
      </small>
      <small>
        Settings survive resuming this session. Summarization may use model
        tokens.
      </small>
      <footer>
        <span role="status">{notice}</span>
        <button
          onClick={() => void save()}
          disabled={!policy || locked || !valid}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </footer>
    </Modal>
  );
}
