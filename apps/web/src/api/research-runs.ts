export type ResearchRunSummary = {
  id: string;
  project: { id: string; name: string };
  title: string;
  status: string;
  created_at: string;
  summary: string;
};

export type ResearchRun = ResearchRunSummary & {
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

async function request<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(endpoint + path, { cache: "no-store", signal });
  const result = await response.json();
  if (!response.ok) throw Error(result?.error || "Cannot read saved research.");
  return result;
}

export const researchRunsAPI = {
  list: (signal: AbortSignal) =>
    request<{ runs: ResearchRunSummary[] }>("", signal),
  read: (id: string, signal: AbortSignal) =>
    request<{ run: ResearchRun }>("/" + encodeURIComponent(id), signal),
  file: (id: string, name: string) =>
    `${endpoint}/${encodeURIComponent(id)}/files/${encodeURIComponent(name)}`,
};
