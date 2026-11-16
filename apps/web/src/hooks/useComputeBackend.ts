import { useEffect, useState } from "react";
import { quantumAPI } from "../api/quantum-workspace";
import {
  computeBackendLabel,
  isComputeHealth,
  type ComputeHealth,
} from "../state/compute-backend";

export function useComputeBackend() {
  const [info, setInfo] = useState<ComputeHealth | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [targetPreview, setTargetPreview] = useState("simulator");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    setChecking(true);
    setError("");
    void quantumAPI
      .health()
      .then((data) => {
        if (!live) return;
        if (!isComputeHealth(data))
          throw new Error("The service returned incomplete backend details.");
        setInfo(data);
      })
      .catch((problem) => {
        if (live)
          setError(
            problem instanceof Error
              ? problem.message
              : "Could not read backend details.",
          );
      })
      .finally(() => {
        if (live) setChecking(false);
      });
    return () => {
      live = false;
    };
  }, [revision]);
  return {
    info,
    targetPreview,
    setTargetPreview,
    runBlockedReason:
      targetPreview === "hardware"
        ? "No QPU is connected. Select Simulator to run locally or over SSH."
        : info?.execution?.stale
          ? "Compute environment changed. Check capabilities and apply an execution profile before running."
          : "",
    checking,
    error,
    label: info
      ? computeBackendLabel(info)
      : checking
        ? "Checking backend…"
        : "Backend details unavailable",
    refresh: () => setRevision((value) => value + 1),
  };
}
