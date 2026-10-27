import type {TodoPanelItem} from './types.js';

/** Only the native task tool creates a child Agent in this channel. */
export function isSubagentToolName(name: string): boolean {
  return name === 'task';
}

function objectArgs(raw: string | undefined): Record<string, unknown> | undefined {
  if (typeof raw !== 'string') return undefined;
  try {
    const value: unknown = JSON.parse(raw);
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

/** Extract a job identifier only from a well-formed tool argument object. */
export function parseJobOutputId(argsFull: string | undefined): string | undefined {
  const id = objectArgs(argsFull)?.job_id;
  return typeof id === 'string' && id.trim() ? id : undefined;
}

/** Prefer the invoked command over a registry label for a background task. */
export function toolCommandOf(argsFull: string | undefined): string | undefined {
  const args = objectArgs(argsFull);
  const command = args?.command ?? args?.text;
  return typeof command === 'string' && command.trim() ? command : undefined;
}

/** The native shell tool's bounded start acknowledgement. */
export const BACKGROUND_START_ACK = /^started background job ([^\s()\r\n]+)(?: \([^\r\n]*\))?(?:\r?\n|$)/u;

/** Invalid optional-plugin data must not replace the last good Todo snapshot. */
export function todoPanelItems(data: unknown): TodoPanelItem[] | undefined {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return undefined;
  const todos = (data as {todos?: unknown}).todos;
  if (!Array.isArray(todos)) return undefined;
  const items: TodoPanelItem[] = [];
  for (const item of todos) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return undefined;
    const {content, status} = item as {content?: unknown; status?: unknown};
    if (typeof content !== 'string' ||
      (status !== 'pending' && status !== 'in_progress' && status !== 'completed')) return undefined;
    items.push({content, status});
  }
  return items;
}
