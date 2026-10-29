import type { AgentView } from "../state/agent-view";
import { contextUsage } from "../state/agent-context";
export function AgentContextUsage({
  view,
  onCompact,
  onConfigure,
  disabled,
  compacting,
}: {
  view: AgentView;
  onCompact: () => void;
  onConfigure: () => void;
  disabled: boolean;
  compacting: boolean;
}) {
  const usage = contextUsage(view);
  const detail =
    usage.used === undefined
      ? "Context usage is not available from the native service yet."
      : `${usage.used.toLocaleString("en-US")} / ${usage.capacity?.toLocaleString("en-US") ?? "unknown capacity"} tokens · ${usage.sampled ? "Last request sample" : "Native context occupancy"}`;
  const label = `ctx ${usage.percent === undefined ? "—" : (usage.sampled ? "~" : "") + usage.percent + "%"}`;
  return (
    <div
      className={
        "fq-agent-ctx " +
        (usage.percent !== undefined && usage.percent >= 90 ? "high" : "")
      }
      title={detail + (usage.compacting ? " · Compacting context…" : "")}
    >
      <span aria-label={label + ". " + detail}>{label}</span>
      {usage.fill !== undefined && (
        <span
          className="fq-agent-ctx-track"
          role="progressbar"
          aria-label="Context window usage"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={usage.fill}
          aria-valuetext={label}
        >
          <i style={{ width: usage.fill + "%" }} />
        </span>
      )}
      <button
        className="fq-agent-auto-policy"
        onClick={onConfigure}
        aria-label="Configure automatic compaction"
        title="Native automatic compaction settings for this session"
      >
        {view.context?.autoPolicy
          ? view.context.autoPolicy.enabled
            ? `Auto ${Math.round(view.context.autoPolicy.thresholdRatio * 100)}%`
            : "Auto off"
          : "Auto —"}
      </button>
      {usage.compacting || compacting ? (
        <small role="status">Compacting…</small>
      ) : (
        view.context?.compactSupported && (
          <button
            className="fq-agent-compact"
            disabled={disabled}
            onClick={onCompact}
            aria-label="Compact context"
            title={
              disabled
                ? "Finish the current turn and pending decisions before compacting."
                : "Compact context using the native Harness. Summarization may use model tokens."
            }
          >
            Compact
          </button>
        )
      )}
    </div>
  );
}
