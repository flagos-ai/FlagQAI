export type EditableCell = {
  id: string;
  cell_type: "code" | "markdown" | "raw";
  source: string;
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
  revision: string;
  cells: EditableCell[];
  kernel: string;
  kernel_id?: string;
  runs: NotebookRun[];
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
async function request(path: string, body?: unknown): Promise<NotebookSession> {
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
