import type { EditableCell } from "../api/notebook-sessions";

export type NotebookHistory = {
  cells: EditableCell[];
  past: EditableCell[][];
  future: EditableCell[][];
  group?: string;
  time?: number;
};
export type NotebookEdit =
  | { type: "load"; cells: EditableCell[] }
  | { type: "edit"; cells: EditableCell[]; group?: string; time: number }
  | { type: "undo" | "redo" };

export function notebookHistory(
  state: NotebookHistory,
  action: NotebookEdit,
): NotebookHistory {
  if (action.type === "load")
    return { cells: action.cells, past: [], future: [] };
  if (action.type === "edit") {
    if (JSON.stringify(action.cells) === JSON.stringify(state.cells))
      return state;
    const coalesce =
      action.group &&
      state.group === action.group &&
      action.time - (state.time || 0) < 800;
    return {
      cells: action.cells,
      past: coalesce ? state.past : [...state.past, state.cells].slice(-50),
      future: [],
      group: action.group,
      time: action.time,
    };
  }
  const stack = action.type === "undo" ? state.past : state.future;
  if (!stack.length) return state;
  return action.type === "undo"
    ? {
        cells: stack[stack.length - 1],
        past: stack.slice(0, -1),
        future: [...state.future, state.cells],
      }
    : {
        cells: stack[stack.length - 1],
        past: [...state.past, state.cells].slice(-50),
        future: stack.slice(0, -1),
      };
}

/** Keep the original cell identity for traceability; the new cell has no output. */
export function splitCell(
  cells: EditableCell[],
  id: string,
  at: number,
  nextId: string,
) {
  return cells.flatMap((cell) =>
    cell.id !== id
      ? [cell]
      : [
          { ...cell, source: cell.source.slice(0, at) },
          {
            id: nextId,
            cell_type: cell.cell_type,
            source: cell.source.slice(at),
          },
        ],
  );
}

export function mergeCell(cells: EditableCell[], index: number) {
  if (
    index >= cells.length - 1 ||
    cells[index].cell_type !== cells[index + 1].cell_type
  )
    return cells;
  return cells.flatMap((cell, i) =>
    i === index
      ? [{ ...cell, source: cell.source + "\n" + cells[i + 1].source }]
      : i === index + 1
        ? []
        : [cell],
  );
}
