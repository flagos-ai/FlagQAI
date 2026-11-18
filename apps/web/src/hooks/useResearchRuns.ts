import { useEffect, useState } from "react";
import {
  RESEARCH_RUNS_CHANGED,
  researchRunsAPI,
  type ResearchRunSummary,
} from "../api/research-runs";

export function useResearchRuns(refreshKey?: string) {
  const [runs, setRuns] = useState<ResearchRunSummary[]>([]);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const reload = () => setRevision((value) => value + 1);
  useEffect(() => {
    window.addEventListener(RESEARCH_RUNS_CHANGED, reload);
    return () => window.removeEventListener(RESEARCH_RUNS_CHANGED, reload);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void researchRunsAPI
      .list(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setRuns(result.runs);
          setError("");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Could not load saved research runs.");
      });
    return () => controller.abort();
  }, [revision, refreshKey]);
  return { runs, error, reload };
}
