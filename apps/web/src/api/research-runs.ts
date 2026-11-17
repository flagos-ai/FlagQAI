export type ResearchRunSummary = {
  id: string;
  project: { id: string; name: string };
  title: string;
  status: string;
  created_at: string;
  summary: string;
};

type BaselineVersion = {
  run_id: string;
  source_sha256: string;
  metrics: { score?: number };
};

export type ProjectBaseline = {
  revision: number;
  current: BaselineVersion | null;
  history: {
    revision: number;
    action: "adopt" | "restore";
    at: string;
    target: BaselineVersion;
  }[];
};

export type BaselineDecision = {
  decision: "adopt" | "restore";
  source_sha256: string;
  expected_project_revision: number;
  request_id: string;
};

export type ResearchRun = ResearchRunSummary & {
  project: ResearchRunSummary["project"] & { baseline?: ProjectBaseline };
  is_project_baseline?: boolean;
  comparison: {
    columns: string[];
    rows: {
      label: string;
      digits: number | null;
      values: (string | number | null)[];
    }[];
    cost_ratio: number | null;
  };
  scope: string | null;
  error?: string | null;
  source_sha256?: string | null;
  evidence: unknown;
  exports: { name: string; label: string; sha256: string }[];
};

const endpoint = "/api/research-runs";

async function request<T>(path: string, options: RequestInit): Promise<T> {
  const response = await fetch(endpoint + path, {
    cache: "no-store",
    ...options,
  });
  const result = await response.json();
  if (!response.ok) throw Error(result?.error || "Cannot read saved research.");
  return result;
}

export const researchRunsAPI = {
  list: (signal: AbortSignal) =>
    request<{ runs: ResearchRunSummary[] }>("", { signal }),
  read: (id: string, signal: AbortSignal) =>
    request<{ run: ResearchRun }>("/" + encodeURIComponent(id), { signal }),
  baseline: (id: string, decision: BaselineDecision) =>
    request<{ baseline: ProjectBaseline }>(
      `/${encodeURIComponent(id)}/baseline`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(decision),
      },
    ),
  file: (id: string, name: string) =>
    `${endpoint}/${encodeURIComponent(id)}/files/${encodeURIComponent(name)}`,
};
