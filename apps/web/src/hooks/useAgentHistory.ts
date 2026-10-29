import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionCatalogResource } from "../../../../packages/sdk/index.d.ts";
import { historyTrash, type HistoryRef } from "../api/history-preferences";
import { harnessClient } from "../api/harness";
export function useAgentHistory() {
  const [sessions, setSessions] = useState<SessionCatalogResource[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [trash, setTrash] = useState<HistoryRef[]>([]),
    [mutating, setMutating] = useState(false),
    [notice, setNotice] = useState("");
  const live = useRef(true),
    operation = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    setError("");
    try {
      const [list, hidden] = await Promise.all([
        harnessClient.listSessions({ signal: request.signal }),
        historyTrash(undefined, request.signal),
      ]);
      if (!request.signal.aborted) {
        setSessions(list);
        setTrash(hidden);
      }
    } catch (problem) {
      if (!request.signal.aborted)
        setError(
          problem instanceof Error
            ? problem.message
            : "Cannot load session history.",
        );
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    live.current = true;
    let mounted = true;
    queueMicrotask(() => {
      if (mounted) void refresh();
    });
    return () => {
      mounted = false;
      live.current = false;
      controller.current?.abort();
    };
  }, [refresh]);
  const mutate = async (action: () => Promise<void>, message: string) => {
    if (operation.current) return false;
    operation.current = true;
    controller.current?.abort();
    setLoading(false);
    setMutating(true);
    setError("");
    setNotice("");
    try {
      await action();
      if (live.current) {
        await refresh();
        setNotice(message);
      }
      return true;
    } catch (problem) {
      if (live.current)
        setError(
          problem instanceof Error ? problem.message : "History update failed.",
        );
      return false;
    } finally {
      operation.current = false;
      if (live.current) setMutating(false);
    }
  };
  const rename = (item: SessionCatalogResource, title: string) =>
    mutate(async () => {
      await harnessClient.renameCatalogSession(
        item.backendId,
        item.sessionId,
        title.trim(),
      );
      if (live.current)
        setSessions((previous) =>
          previous.map((row) =>
            row.backendId === item.backendId && row.sessionId === item.sessionId
              ? { ...row, title: title.trim() }
              : row,
          ),
        );
    }, "Conversation renamed in FlagQAI.");
  const setTrashed = (item: SessionCatalogResource, trashed: boolean) =>
    mutate(
      async () => {
        const value = await historyTrash({
          backendId: item.backendId,
          sessionId: item.sessionId,
          trashed,
        });
        if (live.current) setTrash(value);
      },
      trashed
        ? "Moved to Web Trash. The original FlagQAI record is preserved."
        : "Conversation restored from Web Trash.",
    );
  return {
    sessions,
    loading,
    error,
    refresh,
    trash,
    mutating,
    notice,
    rename,
    setTrashed,
  };
}
