import { useEffect, useState } from "react";
import {
  qpuTechnologies,
  quantumControlSystems,
  hardwareAdapterStatus,
} from "../state/qpu-hardware";
import { quantumAPI } from "../api/quantum-workspace";
import {
  defaultExecutionProfile,
  executionDeviceChoices,
  qpuProviderChoices,
  separateExecutionWorkflows,
  executionMethodLabel,
  executionSummary,
  type ExecutionProfile,
  type ExecutionSelection,
} from "../state/execution-profile";

export function ExecutionConfiguration({
  onApplied,
  target,
  onTargetChange,
}: {
  onApplied: () => void;
  target: string;
  onTargetChange: (target: string) => void;
}) {
  const [selection, setSelection] = useState<ExecutionSelection>();
  const [draft, setDraft] = useState<ExecutionProfile>(defaultExecutionProfile);
  const [technologyId, setTechnologyId] = useState("superconducting");
  const [vendorId, setVendorId] = useState("quafu");
  const [expanded, setExpanded] = useState(() => {
    try {
      return (
        localStorage.getItem("fq-simulator-capability-details-v1") === "on"
      );
    } catch {
      return false;
    }
  });
  const [hardwareExpanded, setHardwareExpanded] = useState(() => {
    try {
      return localStorage.getItem("fq-execution-hardware-details-v1") === "on";
    } catch {
      return false;
    }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let live = true;
    const load = () => {
      setSelection(undefined);
      setNotice("");
      setError("");
      void quantumAPI
        .executionProfile()
        .then((value) => {
          if (live) {
            setSelection(value);
            setDraft(value.profile);
          }
        })
        .catch((problem) => {
          if (live)
            setError(
              problem instanceof Error ? problem.message : String(problem),
            );
        });
    };
    load();
    window.addEventListener("fq-compute-environment-changed", load);
    return () => {
      live = false;
      window.removeEventListener("fq-compute-environment-changed", load);
    };
  }, []);
  const report = selection?.capabilities;
  const providers = qpuProviderChoices(report);
  const technology =
    qpuTechnologies.find((value) => value.id === technologyId) ||
    qpuTechnologies[0];
  const vendor =
    technology.vendors.find((value) => value.id === vendorId) ||
    technology.vendors[0];
  const device = report?.devices.find((value) => value.id === draft.device);
  const method = device?.methods.find((value) => value.id === draft.method);
  const changed =
    !!selection &&
    Object.keys(draft).some(
      (key) =>
        draft[key as keyof ExecutionProfile] !==
        selection.profile[key as keyof ExecutionProfile],
    );
  const ready = target === "simulator" && !!method?.available;
  function edit(change: Partial<ExecutionProfile>) {
    setDraft((value) => ({ ...value, ...change }));
    setNotice("");
  }
  async function perform(apply: boolean) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (apply && selection) {
        const value = await quantumAPI.activateExecutionProfile({
          profile: draft,
          expected_revision: selection.revision,
          environment_revision: selection.environment_revision,
        });
        setSelection(value);
        setNotice(
          "Applied to future circuit tasks. Existing jobs are unchanged.",
        );
        onApplied();
      } else {
        const value = await quantumAPI.checkExecutionCapabilities();
        setSelection(value);
        setNotice(
          "Capabilities checked with small simulator circuits. No QPU submitted.",
        );
      }
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="fq-execution-profile"
      aria-label="Execution target and simulator settings"
    >
      <div
        className="fq-execution-target"
        role="group"
        aria-label="Execution target"
      >
        <button
          aria-pressed={target === "simulator"}
          onClick={() => onTargetChange("simulator")}
          disabled={busy}
        >
          Simulator
        </button>
        <button
          aria-pressed={target === "hardware"}
          onClick={() => onTargetChange("hardware")}
          disabled={busy}
        >
          Real QPU
        </button>
      </div>
      {target === "hardware" ? (
        <div className="fq-execution-unavailable">
          <fieldset>
            <label>
              Technology
              <select
                aria-label="QPU technology"
                value={technology.id}
                onChange={(event) => {
                  const next = qpuTechnologies.find(
                    (value) => value.id === event.target.value,
                  )!;
                  setTechnologyId(next.id);
                  setVendorId(next.vendors[0].id);
                }}
              >
                {qpuTechnologies.map((value) => (
                  <option key={value.id} value={value.id}>
                    {value.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Vendor
              <select
                aria-label="Hardware vendor / platform"
                value={vendor.id}
                onChange={(event) => setVendorId(event.target.value)}
              >
                {technology.vendors.map((value) => (
                  <option key={value.id} value={value.id}>
                    {value.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Device
              <select aria-label="Real QPU device" disabled value="">
                <option value="">No connected device</option>
              </select>
            </label>
          </fieldset>
          {vendor.accessChannel && (
            <p className="fq-qpu-channel">
              via {vendor.accessChannel} · Ising / QUBO
            </p>
          )}
          <details className="fq-execution-more" open={hardwareExpanded}>
            <summary
              onClick={(event) => {
                event.preventDefault();
                const open = !hardwareExpanded;
                setHardwareExpanded(open);
                try {
                  localStorage.setItem(
                    "fq-execution-hardware-details-v1",
                    open ? "on" : "off",
                  );
                } catch {
                  /* Keep disclosure usable without storage. */
                }
              }}
            >
              Connection and capabilities
            </summary>
            <div className="fq-execution-detail-group">
              <h4>Selected platform</h4>
              <p>{vendor.workload}</p>
              <dl className="fq-qpu-status" aria-label="QPU connection status">
                {vendor.accessChannel && (
                  <div>
                    <dt>Access channel</dt>
                    <dd>{vendor.accessChannel}</dd>
                  </div>
                )}
                <div>
                  <dt>SDK adapter</dt>
                  <dd>{hardwareAdapterStatus(vendor, report)}</dd>
                </div>
                <div>
                  <dt>Submission</dt>
                  <dd>
                    Unavailable until a hardware connection and device are
                    verified
                  </dd>
                </div>
              </dl>
              <p>
                Configure a server-side provider connection and credentials to
                discover real devices. Device capacity, topology, native gates,
                calibration, queue and cost are not yet known.
              </p>
              <div className="fq-execution-profile-actions">
                <button disabled={busy} onClick={() => void perform(false)}>
                  {busy ? "Checking…" : "Check SDK adapters"}
                </button>
              </div>
              <p>
                This checks local SDK modules and small simulator probes. It
                does not connect to a QPU service or submit a hardware job.
              </p>
            </div>
            <div className="fq-execution-detail-group">
              <h4>Access channels</h4>
              <dl className="fq-qpu-status">
                {providers.map((value) => (
                  <div key={value.id}>
                    <dt>{value.label}</dt>
                    <dd>
                      {value.adapter_status === "module_present"
                        ? "Module installed"
                        : value.adapter_status === "not_found"
                          ? "Not found"
                          : "Not checked"}
                    </dd>
                  </div>
                ))}
              </dl>
              <p>
                Braket and Azure are cloud access channels; HTTP is a transport
                adapter. Installed modules do not confirm access to the selected
                device.
              </p>
              <p>
                QBOSON connects through Kaiwu for Ising / QUBO optimization and
                sampling. Gate circuits, analog programs and Ising tasks require
                different adapters; an arbitrary gate circuit cannot run through
                Kaiwu here.
              </p>
            </div>
            <div className="fq-execution-detail-group">
              <h4>Quantum control systems</h4>
              {quantumControlSystems.map((value) => (
                <p key={value.id}>
                  <strong>{value.label}</strong> · not connected
                </p>
              ))}
              <p>
                Control systems operate compatible hardware; they are not a QPU
                technology or a runnable device.
              </p>
            </div>
            <div className="fq-execution-detail-group">
              <h4>Local / SSH compute environment</h4>
              <p>
                This compute environment runs SDK checks and simulator tasks. It
                is separate from the selected QPU platform. Catalog entries and
                provider simulators do not establish a real hardware connection.
              </p>
            </div>
          </details>
        </div>
      ) : (
        <>
          {selection?.stale && (
            <p role="alert">
              Compute environment changed. Check capabilities and apply a
              profile before running.
            </p>
          )}
          <fieldset
            disabled={busy || !selection}
            aria-label="Next execution settings"
          >
            <legend>Configure next run</legend>
            <label>
              Device
              <select
                aria-label="Compute device"
                value={draft.device}
                onChange={(event) => edit({ device: event.target.value })}
              >
                {executionDeviceChoices(report, draft.device).map((value) => (
                  <option
                    key={value.id}
                    value={value.id}
                    disabled={value.disabled}
                  >
                    {value.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Method
              <select
                aria-label="Simulation method"
                value={draft.method}
                onChange={(event) => edit({ method: event.target.value })}
              >
                {!device?.methods.some(
                  (value) => value.id === draft.method,
                ) && (
                  <option value={draft.method}>
                    {executionMethodLabel(draft.method)} · not checked
                  </option>
                )}
                {device?.methods.map((value) => (
                  <option
                    key={value.id}
                    value={value.id}
                    disabled={!value.available}
                  >
                    {value.label}
                    {!value.available ? " · unavailable" : ""}
                  </option>
                ))}
                {separateExecutionWorkflows.map((value) => (
                  <option key={value.id} value={value.id} disabled>
                    {value.label} · separate task workflow
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
          {!report && (
            <p>
              Check the selected environment to discover its SDK, devices and
              usable methods.
            </p>
          )}
          <div
            className="fq-execution-apply-state"
            data-state={
              !selection
                ? "loading"
                : selection.stale
                  ? "stale"
                  : !selection.revision
                    ? "unconfigured"
                    : changed
                      ? "pending"
                      : "applied"
            }
            aria-live="polite"
          >
            <span>
              {!selection
                ? "Loading profile…"
                : selection.stale
                  ? "Environment changed"
                  : !selection.revision
                    ? "Not applied"
                    : changed
                      ? "Unapplied changes"
                      : "Applied"}
            </span>
            {selection && selection.revision > 0 ? (
              <dl
                className="fq-execution-current"
                aria-label="Applied execution profile"
              >
                <dt>{selection.stale ? "Previously applied" : "Current"}</dt>
                <dd>{executionSummary(selection.profile)}</dd>
                <dt>Scale</dt>
                <dd>Single node · single device</dd>
              </dl>
            ) : (
              <small>No profile applied yet</small>
            )}
          </div>
          <div className="fq-execution-profile-actions">
            <button disabled={busy} onClick={() => void perform(false)}>
              {busy ? "Working…" : "Check environment"}
            </button>
            <button
              className="primary"
              disabled={
                busy ||
                !ready ||
                (!changed && !selection?.stale && !!selection?.revision)
              }
              onClick={() => void perform(true)}
            >
              Apply
            </button>
          </div>
          <details className="fq-execution-more" open={expanded}>
            <summary
              onClick={(event) => {
                event.preventDefault();
                const open = !expanded;
                setExpanded(open);
                try {
                  localStorage.setItem(
                    "fq-simulator-capability-details-v1",
                    open ? "on" : "off",
                  );
                } catch {
                  /* Keep disclosure usable without storage. */
                }
              }}
            >
              More settings and capabilities
            </summary>
            <div className="fq-execution-detail-group">
              <h4>Execution scale</h4>
              <fieldset disabled={busy || !selection}>
                <label>
                  Scale
                  <select value="single_device" onChange={() => {}}>
                    <option value="single_device">
                      Single node · single device
                    </option>
                    <option value="multi_device" disabled>
                      Single node · multiple devices · not connected
                    </option>
                    <option value="multi_node" disabled>
                      Multiple nodes · launcher required
                    </option>
                  </select>
                </label>
              </fieldset>
              <p>
                Multi-device and multi-node execution require dedicated
                launchers and allocated resources.
              </p>
            </div>
            <div className="fq-execution-detail-group">
              <h4>GPU and AI chips</h4>
              {report?.device_families
                ?.filter((value) => value.status !== "detected")
                .map((value) => (
                  <p key={value.id}>
                    <strong>{value.label}</strong>
                    <br />
                    {value.reason}
                  </p>
                ))}
              <p>
                Select a local or SSH environment with the matching runtime,
                then check its devices. CPU, GPU and AI chips are simulator
                compute platforms.
              </p>
            </div>
            <div className="fq-execution-detail-group">
              <h4>Other task workflows</h4>
              <div className="fq-execution-workflows">
                {separateExecutionWorkflows.map((value) => (
                  <div key={value.id}>
                    <strong>{value.label}</strong>
                    <small>{value.reason}</small>
                  </div>
                ))}
              </div>
              {device?.methods
                .filter((value) => !value.available)
                .map((value) => (
                  <p key={value.id}>
                    <strong>{value.label}</strong>
                    <br />
                    {value.reason}
                  </p>
                ))}
            </div>
            <div className="fq-execution-detail-group">
              <h4>Environment and limits</h4>
              {report && (
                <p>FlagQuantum {report.sdk_version} · PyTorch · complex64</p>
              )}
              <p>
                These settings control Web circuit tasks. Python code retains
                its explicit ExecutionOptions.
              </p>
            </div>
          </details>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
