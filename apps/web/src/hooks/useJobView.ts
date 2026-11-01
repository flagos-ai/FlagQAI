import { useEffect, useState } from "react";
import type { QuantumJob } from "../contracts/quantum-workspace";
import {
  defaultJobView,
  normalizeJobView,
  readJobView,
  writeJobView,
  type JobView,
} from "../state/job-view";
export function useJobView(job: QuantumJob) {
  const [view, setView] = useState(() => {
    try {
      return readJobView(sessionStorage, job);
    } catch {
      return { ...defaultJobView };
    }
  });
  useEffect(() => {
    try {
      writeJobView(sessionStorage, job, view);
    } catch {
      /* View preferences are optional. */
    }
  }, [job.id, view]);
  const update = <K extends keyof JobView>(field: K, value: JobView[K]) =>
    setView((previous) => ({ ...previous, [field]: value }));
  return { view: normalizeJobView(view, job), update };
}
