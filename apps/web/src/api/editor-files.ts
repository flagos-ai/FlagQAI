export type FileSnapshot = {
  id: string;
  path: string;
  source: string;
  revision: string;
};
async function request(
  url: string,
  options?: RequestInit,
): Promise<FileSnapshot> {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.error || "Shared model is unavailable.");
  return body;
}
export const editorFiles = {
  create: (source: string, language = "qasm") =>
    request("/api/editor/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, language }),
    }),
  read: (id: string, signal: AbortSignal) =>
    request("/api/editor/files/" + encodeURIComponent(id), { signal }),
};
