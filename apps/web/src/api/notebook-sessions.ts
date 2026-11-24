export type EditableCell = {
  id: string;
  cell_type: "code" | "markdown" | "raw";
  source: string;
  notebook?: Record<string, unknown>;
};
export type CellOutput = {
  output_type: string;
  text?: string;
  ename?: string;
  evalue?: string;
  traceback?: string[];
  data?: Record<string, unknown>;
};
export type CellRun = {
  id: string;
  source: string;
  status: string;
  execution_count?: number;
  outputs: CellOutput[];
};
export type NotebookRun = {
  runtime?: {
    python: string;
    executable: string;
    cell_timeout_seconds?: number;
    cpu_threads?: number;
  };
  id: string;
  status: string;
  revision: string;
  kernel_id: string;
  cells: CellRun[];
  error?: string;
};
export type NotebookSession = {
  id: string;
  title: string;
  notebook_id: string;
  revision: string;
  cells: EditableCell[];
  kernel: string;
  kernel_id?: string;
  runs: NotebookRun[];
  metadata?: Record<string, unknown>;
};
export type ExecuteCells = {
  request_id: string;
  revision: string;
  cell_ids: string[];
};
export class NotebookRequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function request<T = NotebookSession>(
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(
    "/api/notebook-sessions" + path,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await response.json();
  if (!response.ok)
    throw new NotebookRequestError(
      data.error || "Notebook request failed; your local edits are retained.",
      response.status,
    );
  return data;
}
export const notebookSessions = {
  import: (request_id: string, title: string, notebook: unknown) =>
    request("/import", { request_id, title, notebook }),
  assist: async (
    id: string,
    source: string,
    cursor: number,
    kind: "complete" | "inspect",
  ) => {
    // Browser carets use UTF-16 offsets; IPython uses Unicode code points.
    const value = await request<NotebookAssistance>("/" + id + "/assist", {
      source,
      cursor: Array.from(source.slice(0, cursor)).length,
      kind,
    });
    const characters = Array.from(source);
    return {
      ...value,
      cursor_start:
        value.cursor_start === undefined
          ? undefined
          : characters.slice(0, value.cursor_start).join("").length,
      cursor_end:
        value.cursor_end === undefined
          ? undefined
          : characters.slice(0, value.cursor_end).join("").length,
    };
  },
  open: (notebook_id: string, request_id: string) =>
    request("", { notebook_id, request_id }),
  read: (id: string) => request("/" + id),
  save: (id: string, revision: string, cells: EditableCell[]) =>
    request("/" + id + "/save", { revision, cells }),
  execute: (id: string, data: ExecuteCells) =>
    request("/" + id + "/execute", data),
  control: (id: string, action: "interrupt" | "restart") =>
    request("/" + id + "/" + action, {}),
};

export type NotebookAssistance = {
  matches?: string[];
  cursor_start?: number;
  cursor_end?: number;
  documentation?: string;
  available: boolean;
};
