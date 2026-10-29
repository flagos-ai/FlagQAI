import type { SessionViewRow } from "../../../../packages/sdk/index.d.ts";
import type { AgentView } from "./agent-view";

// Group presentation only; the native transcript and its row IDs stay intact.
export function transcriptTurns(view: AgentView) {
  const turns: { id: number; rows: SessionViewRow[]; active: boolean }[] = [];
  for (const id of view.order) {
    const row = view.rows[id];
    if (!row) continue;
    if (row.kind === "user" || !turns.length)
      turns.push({ id, rows: [], active: false });
    turns.at(-1)!.rows.push(row);
  }
  if (turns.length) turns.at(-1)!.active = view.working;
  return turns.map((turn) => {
    const lastActivity = turn.rows.reduce(
      (last, row, index) =>
        row.kind === "tool" ||
        row.kind === "reasoning" ||
        row.kind === "subagent"
          ? index
          : last,
      -1,
    );
    const final = turn.rows.reduce(
      (last, row, index) => (row.kind === "assistant" ? index : last),
      -1,
    );
    const lastPrimaryActivity = turn.rows.reduce(
      (last, row, index) =>
        row.kind === "tool" || row.kind === "reasoning" ? index : last,
      -1,
    );
    const finalAnswer = final > lastPrimaryActivity ? final : -1;
    const work = turn.rows.filter(
      (row, index) =>
        row.kind === "tool" ||
        row.kind === "reasoning" ||
        row.kind === "subagent" ||
        (row.kind === "assistant" && index !== finalAnswer),
    );
    const workIds = new Set(work.map((row) => row.id));
    const ledger = [...turn.rows]
      .reverse()
      .find((row) => row.kind === "turn-summary")?.turnUsage;
    const userSeq = turn.rows.find((row) => row.kind === "user")?.seq;
    const timing =
      userSeq === undefined ? undefined : view.turnTimings?.[userSeq];
    return {
      ...turn,
      work: lastActivity >= 0 ? work : [],
      visible:
        lastActivity >= 0
          ? turn.rows.filter((row) => !workIds.has(row.id))
          : turn.rows,
      durationMs: ledger?.durationMs ?? timing?.durationMs,
      outcome: ledger?.outcome ?? timing?.outcome,
      toolCount: work.filter((row) => row.kind === "tool").length,
    };
  });
}

export function workDuration(ms: number | undefined) {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return "";
  const seconds = Math.max(1, Math.round(ms / 1000));
  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
