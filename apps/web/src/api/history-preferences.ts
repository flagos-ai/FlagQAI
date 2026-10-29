export type HistoryRef = { backendId: string; sessionId: string };
export async function historyTrash(
  input?: HistoryRef & { trashed: boolean },
  signal?: AbortSignal,
): Promise<HistoryRef[]> {
  const response = await fetch(
    "/api/agent/history-trash",
    input
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
          signal,
        }
      : { signal },
  );
  const value = await response.json();
  if (!response.ok)
    throw new Error(value.error || "Cannot update history visibility.");
  return value.trash;
}
