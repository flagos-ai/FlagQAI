import { useState } from "react";
import type { useComputeBackend } from "../hooks/useComputeBackend";
import { computeBackendName, reportedLimit } from "../state/compute-backend";
import { UIIcon } from "./UIIcon";

export function ExecutionBackend({
  backend,
}: {
  backend: ReturnType<typeof useComputeBackend>;
}) {
  const [expanded, setExpanded] = useState(() => {
    try {
      return localStorage.getItem("fq-execution-backend-details-v1") === "on";
    } catch {
      return false;
    }
  });
  const { info, checking, error } = backend;
  return (
    <>
      <div className="fq-pane-title">
        EXECUTION BACKEND
        <button
          className="fq-control-icon"
          aria-label="Refresh compute backend"
          title="Refresh backend details"
          disabled={checking}
          onClick={backend.refresh}
        >
          <UIIcon
            name="refresh"
            size={14}
            className={checking ? "fq-ui-busy" : ""}
          />
        </button>
      </div>
      <section
        className="fq-library-body fq-execution-backend"
        aria-label="Compute backend"
      >
        <div className="fq-execution-backend-identity">
          <h3>
            {info
              ? computeBackendName(info)
              : checking
                ? "Checking backend…"
                : "Backend details unavailable"}
          </h3>
          {info && <span>{info.transport}</span>}
        </div>
        <p>Compute connection is checked when compiling or running.</p>
        {error && (
          <p role="alert">
            {info
              ? "Could not refresh. Showing the last received details. "
              : "Could not read backend details. "}
            {error}
          </p>
        )}
        {info && (
          <details open={expanded}>
            <summary
              onClick={(event) => {
                event.preventDefault();
                const open = !expanded;
                setExpanded(open);
                try {
                  localStorage.setItem(
                    "fq-execution-backend-details-v1",
                    open ? "on" : "off",
                  );
                } catch {
                  /* Keep current controls usable without storage. */
                }
              }}
            >
              Limits and details
            </summary>
            <dl>
              <div>
                <dt>Backend</dt>
                <dd>{info.backend}</dd>
              </div>
              <div>
                <dt>Transport</dt>
                <dd>{info.transport}</dd>
              </div>
              <div>
                <dt>Max qubits</dt>
                <dd>{reportedLimit(info.max_qubits)}</dd>
              </div>
              <div>
                <dt>Max shots</dt>
                <dd>{reportedLimit(info.max_shots)}</dd>
              </div>
              {info.backend === "flagquantum_pytorch_cpu" && (
                <>
                  <div>
                    <dt>CPU threads / task</dt>
                    <dd>2</dd>
                  </div>
                  <div>
                    <dt>Active / waiting tasks</dt>
                    <dd>1 / 3</dd>
                  </div>
                  <div>
                    <dt>Process limit</dt>
                    <dd>90 seconds</dd>
                  </div>
                </>
              )}
            </dl>
            <p>Credentials stay in the local environment.</p>
          </details>
        )}
      </section>
    </>
  );
}
