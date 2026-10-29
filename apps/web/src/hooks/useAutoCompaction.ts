import { useEffect, useState } from "react";
import type { AutoCompactionPolicy } from "../../../../packages/sdk/index.d.ts";
import { harnessClient } from "../api/harness";
export function useAutoCompaction(sessionId: string | undefined) {
  const [policy, setPolicy] = useState<AutoCompactionPolicy | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setPolicy(null);
    setError("");
    if (sessionId)
      void harnessClient
        .getCompactionPolicy(sessionId, { signal: controller.signal })
        .then((result) => {
          if (!controller.signal.aborted) setPolicy(result.policy);
        })
        .catch((problem) => {
          if (!controller.signal.aborted)
            setError(
              problem instanceof Error
                ? problem.message
                : "Cannot read native settings.",
            );
        });
    else setError("Connect to a session first.");
    return () => controller.abort();
  }, [sessionId]);
  return { policy, setPolicy, error };
}
