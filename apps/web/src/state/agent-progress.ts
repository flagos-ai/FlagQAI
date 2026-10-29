import { transcriptTurns } from "./agent-turns.ts";
import type { AgentView } from "./agent-view";
import type {
  SessionSubagentView,
  SessionTodoItem,
  SessionViewRow,
} from "../../../../packages/sdk/index.d.ts";
export type ChildActivity = {
  id: string;
  description: string;
  status: string;
  startedAt?: number;
  durationMs?: number;
  model?: string;
  summary?: string;
  lastTool?: string;
  output?: string[];
  error?: string;
};
export type TurnProgress = {
  todos?: SessionTodoItem[];
  children?: Record<string, ChildActivity>;
};
export function todoItems(input: unknown): SessionTodoItem[] {
  if (!Array.isArray(input)) return [];
  return input.filter(
    (item): item is SessionTodoItem =>
      !!item &&
      typeof item.content === "string" &&
      ["pending", "in_progress", "completed"].includes(item.status),
  );
}
export function nativeChild(row: SessionViewRow): ChildActivity | undefined {
  const child = row.subagent;
  if (!child) return;
  return {
    id: child.agentId,
    description: child.description,
    status: child.status,
    startedAt: child.startedAt,
    durationMs: child.durationMs,
    model: child.model,
    summary: child.summary,
    output: child.outputLines,
    error: child.error,
  };
}
export function mergeChildren(
  progress: TurnProgress | undefined,
  rows: SessionViewRow[],
  roster: SessionSubagentView[],
) {
  const children = new Map<string, ChildActivity>();
  for (const child of roster)
    children.set(child.id, {
      id: child.id,
      description: child.description,
      status: child.status,
      model: child.model,
      summary: child.summary,
      startedAt: child.createdAt,
    });
  for (const row of rows) {
    const child = nativeChild(row);
    if (child) children.set(child.id, { ...children.get(child.id), ...child });
  }
  for (const child of Object.values(progress?.children || {}))
    children.set(child.id, { ...children.get(child.id), ...child });
  return [...children.values()];
}
export function childTranscript(
  events: Array<{ type: string; [key: string]: unknown }>,
) {
  return events.flatMap((event) => {
    const blocks = Array.isArray(event.blocks) ? event.blocks : [];
    const text =
      typeof event.text === "string"
        ? event.text
        : blocks
            .map((block) => (typeof block.text === "string" ? block.text : ""))
            .join("\n");
    if (["assistant.message", "user.message"].includes(event.type) && text)
      return [
        {
          label: event.type === "assistant.message" ? "Subagent" : "Task",
          text,
          code: false,
        },
      ];
    if (event.type === "tool.call")
      return [
        {
          label: String(event.name || "Tool"),
          text: typeof event.argsJson === "string" ? event.argsJson : "",
          code: true,
        },
      ];
    if (event.type === "tool.result" && text)
      return [
        {
          label: event.isError ? "Tool error" : "Tool result",
          text,
          code: true,
        },
      ];
    return [];
  });
}

export const childRunning = (child: ChildActivity) =>
  ["starting", "running"].includes(child.status);

export function progressTurns(view: AgentView, roster: SessionSubagentView[]) {
  const turns = transcriptTurns(view);
  const start = (seq: number | undefined) =>
    seq === undefined
      ? undefined
      : (view.turnTimings?.[seq]?.startedAt ??
        (view.activeTiming?.userSeq === seq
          ? view.activeTiming.startedAt
          : undefined));
  return turns.map((turn, index) => {
    const seq = turn.rows.find((row) => row.kind === "user")?.seq;
    const progress = seq === undefined ? undefined : view.progress?.[seq];
    const startedAt = start(seq);
    const nextStart = start(
      turns[index + 1]?.rows.find((row) => row.kind === "user")?.seq,
    );
    const catalog = roster.filter(
      (child) =>
        startedAt !== undefined &&
        child.createdAt >= startedAt &&
        (nextStart === undefined || child.createdAt < nextStart),
    );
    return {
      ...turn,
      progress,
      children: mergeChildren(progress, turn.rows, catalog),
    };
  });
}
export function dockChildren(view: AgentView, roster: SessionSubagentView[]) {
  const children = new Map<string, ChildActivity>();
  for (const turn of progressTurns(view, roster))
    for (const child of turn.children) {
      if (turn.active || childRunning(child)) children.set(child.id, child);
      else children.delete(child.id);
    }
  return [...children.values()];
}
