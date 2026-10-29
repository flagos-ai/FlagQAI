import type { AgentView } from "./agent-view";
export function contextUsage(
  view: Pick<AgentView, "context" | "contextWindow">,
) {
  const reading = view.context?.occupancy;
  const used = reading?.usedTokens;
  const capacity = reading?.contextWindow ?? view.contextWindow;
  const validUsed =
    typeof used === "number" && Number.isFinite(used) && used >= 0;
  const validCapacity =
    typeof capacity === "number" && Number.isFinite(capacity) && capacity > 0;
  const percent =
    validUsed && validCapacity
      ? Math.round((used / capacity) * 100)
      : undefined;
  return {
    used: validUsed ? used : undefined,
    capacity: validCapacity ? capacity : undefined,
    percent,
    fill: percent === undefined ? undefined : Math.min(100, percent),
    sampled: reading?.source === "sample",
    compacting: !!view.context?.compaction,
  };
}
