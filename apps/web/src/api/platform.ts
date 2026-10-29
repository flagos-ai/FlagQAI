import type { PythonRun } from "./python-runs";
import type { ProgramSnapshot } from "../contracts/quantum-workspace";
export type PlatformAction = {
  seq: number;
  id: string;
  operation: string;
  status: "running" | "completed" | "failed";
  origin?: "ui" | "agent";
  created_at: number;
  turn_seq?: number;
  error?: string;
  result?: {
    program?: ProgramSnapshot;
    python_run?: PythonRun;
    job?: { id: string; name: string; status: string };
    file?: { id: string; path: string; source: string; revision: string };
    name?: string;
    expected_name?: string;
    expected_source?: string;
    expected_link?: string;
    page?: string;
    program_id?: string;
    job_id?: string;
  };
};
async function request<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    signal,
    cache: "no-store",
    ...(body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "Workbench action failed.");
  return value;
}
export const platformAPI = {
  publish: (body: unknown, signal?: AbortSignal) =>
    request<{
      ready: boolean;
      source_hash: string;
      backend: { transport: string; backend: string };
    }>("/api/workspace/context", body, signal),
  events: (
    client: string,
    session: string,
    after: number,
    signal?: AbortSignal,
  ) =>
    request<PlatformAction[]>(
      `/api/workspace/events?client=${encodeURIComponent(client)}&session=${encodeURIComponent(session)}&after=${after}`,
      undefined,
      signal,
    ),
  action: <T>(body: unknown) => request<T>("/api/workspace/actions", body),
};
