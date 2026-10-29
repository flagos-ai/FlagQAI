import { useEffect, useState } from "react";
import type { SessionSubagentView } from "../../../../packages/sdk/index.d.ts";
import { harnessClient } from "../api/harness";

// Read the native catalog as a fallback for children absent from transcript rows.
export function useAgentSubagents(
  sessionId: string | undefined,
  connected: boolean,
) {
  const [state, setState] = useState<{
    sessionId?: string;
    children: SessionSubagentView[];
  }>({ children: [] });
  useEffect(() => {
    if (!sessionId || !connected) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const result = await harnessClient.listSessionSubagents(sessionId, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setState({ sessionId, children: result.subagents });
        if (!result.supported) return;
      } catch {
        // Event/row status remains usable when catalog capability is unavailable.
      }
      if (!controller.signal.aborted) timer = setTimeout(refresh, 2500);
    };
    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [sessionId, connected]);
  return state.sessionId === sessionId ? state.children : [];
}
