import { useEffect, useState } from "react";
import { reproductionAPI, type Verification } from "../api/reproduction";
import type { ArchivedVerification } from "../api/research-packages";
import {
  verificationLabel,
  verificationSummary,
} from "../state/verification-presentation";
export function VerificationSummary({
  run,
  source,
  packageId,
  archived = [],
  adopted,
}: {
  run: string;
  source: string;
  packageId?: string;
  archived?: ArchivedVerification[];
  adopted: boolean;
}) {
  const [current, setCurrent] = useState<Verification[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true,
      timer: ReturnType<typeof setTimeout>;
    setCurrent([]);
    const refresh = async () => {
      try {
        const values = await reproductionAPI.list(run, packageId);
        if (alive) {
          setCurrent(values);
          setError("");
        }
      } catch (problem) {
        if (alive) setError(String(problem));
      }
      if (alive) timer = setTimeout(refresh, 2000);
    };
    void refresh();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [run, source, packageId]);
  const summary = verificationSummary(current, archived, run, source);
  return (
    <div
      className="fq-delivery-verification"
      role="region"
      aria-label="Delivery verification summary"
    >
      <p>
        {adopted ? "Adopted source" : "Selected source · no adoption decision"}:{" "}
        {source.slice(0, 12)}. Archived verification: {summary.history.length}{" "}
        records · {summary.archivedPassed} passing. Current environment:{" "}
        {error
          ? "unavailable · last confirmed results retained"
          : `${summary.local.length} records · ${summary.currentPassed} passing`}
        .
      </p>
      {summary.history[0] && (
        <small>
          Latest archived environment: SDK{" "}
          {summary.history[0].report.runtime.sdk_version || "unrecorded"} ·{" "}
          {summary.history[0].report.configured_environment.transport}. This
          describes the supplied record.
        </small>
      )}
      <p>
        {error
          ? "Current verification history unavailable; no success is assumed."
          : summary.latest
            ? verificationLabel(summary.latest)
            : "Not verified in the current environment."}{" "}
        {summary.latest && (
          <>
            {" "}
            · SDK {summary.latest.runtime.sdk_version || "missing"} ·{" "}
            {summary.latest.configured_environment.transport}.{" "}
          </>
        )}
        Imported passes do not verify this environment.
      </p>
      {summary.warnings.length > 0 && (
        <details>
          <summary>
            Environment differences and remaining limits ·{" "}
            {summary.warnings.length}
          </summary>
          <ul>
            {summary.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
