import type { ProgramSnapshot } from "../contracts/quantum-workspace";
export type PythonRun = {
  id: string;
  name: string;
  source: string;
  status:
    | "queued"
    | "running"
    | "completed"
    | "failed"
    | "cancelled"
    | "timed_out";
  source_hash?: string;
  execution_status?: string;
  collection_status?:
    | "pending"
    | "collecting"
    | "completed"
    | "partial"
    | "failed"
    | "cancelled";
  collection_errors?: { filename: string; message: string; file_id?: string }[];
  experiments?: {
    id: string;
    filename: string;
    sha256: string;
    has_result: boolean;
  }[];
  logs: { stream: string; text: string }[];
  environment: {
    transport: string;
    python: string;
    timeout_seconds: number;
    scope: string;
  };
  runtime?: {
    python: string;
    cwd: string;
    sdk_version?: string | null;
    save_load_supported?: boolean;
  };
  exit_code?: number;
  elapsed_seconds?: number;
  error?: string;
  truncated?: boolean;
  artifact?: {
    program: ProgramSnapshot;
    job?: { id: string; name: string; status: string };
    statevector?: [number, number][];
  };
};
async function request<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch("/api/python/" + path, {
    signal,
    ...(body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  }).catch((problem: unknown) => {
    if (signal?.aborted) throw problem;
    throw new Error(
      body === undefined
        ? "Cannot connect to the local Python service. Your saved output and draft are retained; reconnect to continue."
        : "Connection interrupted. The action status is unknown; check run history before retrying. Your draft is retained.",
    );
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Python task failed.");
  return data;
}
export const pythonAPI = {
  run: (source: string, name: string) =>
    request<PythonRun>("runs", { source, name }),
  read: (id: string, signal?: AbortSignal) =>
    request<PythonRun>("runs/" + encodeURIComponent(id), undefined, signal),
  list: () => request<PythonRun[]>("runs"),
  cancel: (id: string) =>
    request<PythonRun>("runs/" + encodeURIComponent(id) + "/cancel", {}),
  collect: (id: string) =>
    request<PythonRun>("runs/" + encodeURIComponent(id) + "/collect", {}),
  environment: () => request<PythonRun["environment"]>("environment"),
  check: (source: string, signal?: AbortSignal) =>
    request<{
      diagnostic: { message: string; line: number; column: number } | null;
    }>("check", { source }, signal),
};
