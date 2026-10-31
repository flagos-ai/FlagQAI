import type { AgentView } from "./agent-view";

type RunState = {
  view: Pick<
    AgentView,
    "projected" | "working" | "permissions" | "questions" | "stop" | "context"
  >;
  phase: string;
  stopping?: boolean;
  sending?: boolean;
  busy?: boolean;
  compacting?: boolean;
};
// Presentation only. Native projection and control events remain authoritative;
// a successful cancellation receipt alone never proves execution has ended.
export function agentRunStatus(agent: RunState) {
  const { view } = agent;
  if (agent.phase === "reconnecting") return "Reconnecting…";
  if (
    agent.phase === "connecting" ||
    (agent.phase === "connected" && !view.projected)
  )
    return "Synchronizing…";
  if (agent.phase !== "connected")
    return agent.busy ? "Connecting…" : "Not connected";
  if (agent.stopping || view.stop === "stopping") return "Stopping…";
  if (agent.compacting || view.context?.compaction) return "Compacting…";
  if (Object.keys(view.permissions).length) return "Waiting for permission";
  if (Object.keys(view.questions).length) return "Waiting for your answer";
  if (agent.sending) return "Sending…";
  if (view.working) return "Working";
  return "Connected";
}
export function stopFeedback(state?: string, queued = 0) {
  const text =
    state === "stopping"
      ? "Stop requested. Waiting for the native Agent to finish."
      : state === "stopped"
        ? "Agent stopped. Existing code and results are retained."
        : state === "unknown"
          ? "Stop is unconfirmed. The Agent may still be running. Reconnect to check, or retry Stop."
          : state === "failed"
            ? "Stop failed. The Agent may still be running. You can retry Stop."
            : "";
  return text && queued > 0
    ? `${text} ${queued} message${queued === 1 ? " remains" : "s remain"} queued in the native session.`
    : text;
}
