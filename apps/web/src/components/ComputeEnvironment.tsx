import { useEffect, useState } from "react";
import {
  quantumAPI,
  type ComputeConfig,
  type ComputeSelection,
} from "../api/quantum-workspace";
import type { useComputeBackend } from "../hooks/useComputeBackend";
import { parseSSHCommand } from "../state/ssh-command";
import { Modal } from "./Modal";
import { CloseButton } from "./CloseButton";

export function ComputeEnvironment({
  backend,
}: {
  backend: ReturnType<typeof useComputeBackend>;
}) {
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<ComputeSelection>();
  const [config, setConfig] = useState<ComputeConfig>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [check, setCheck] = useState<{
    check_id: string;
    runtime: {
      python: string;
      sdk_version?: string;
      pytorch?: string;
      synth_supported?: boolean;
    };
  }>();
  useEffect(() => {
    if (!open) return;
    let live = true;
    setBusy(true);
    setError("");
    setCheck(undefined);
    setConfig(undefined);
    void quantumAPI
      .computeEnvironment()
      .then((value) => {
        if (live) {
          setSelection(value);
          setConfig(value.config);
        }
      })
      .catch((problem) => {
        if (live) setError(String(problem.message || problem));
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [open]);
  const edit = (change: Partial<ComputeConfig>) => {
    setConfig((value) => value && { ...value, ...change });
    setCheck(undefined);
    setError("");
  };
  let connectionPreview = "";
  if (config?.transport === "ssh") {
    try {
      const parsed = parseSSHCommand(config.ssh_target, config.ssh_port);
      if (parsed.command)
        connectionPreview = `Connect to ${parsed.target} · Port ${parsed.port}${parsed.identity ? " · Identity file specified" : ""}`;
    } catch {
      // Allow incomplete text while editing; validation runs on Check environment.
    }
  }
  async function perform(activate: boolean) {
    if (!config || !selection) return;
    setBusy(true);
    setError("");
    try {
      const parsed =
        config.transport === "ssh"
          ? parseSSHCommand(config.ssh_target, config.ssh_port)
          : null;
      const resolved = parsed
        ? {
            ...config,
            ssh_target: parsed.target,
            ssh_port: parsed.port,
            ssh_identity: parsed.command
              ? parsed.identity
              : config.ssh_identity || "",
          }
        : config;
      if (activate && check) {
        await quantumAPI.activateComputeEnvironment({
          config: resolved,
          expected_revision: selection.revision,
          check_id: check.check_id,
        });
        backend.refresh();
        window.dispatchEvent(new Event("fq-compute-environment-changed"));
        setOpen(false);
      } else setCheck(await quantumAPI.checkComputeEnvironment(resolved));
    } catch (problem) {
      setCheck(undefined);
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className="fq-compute-trigger"
        onClick={() => setOpen(true)}
        title="Choose the environment for future Python and circuit tasks"
        aria-label="Choose compute environment"
      >
        <span aria-hidden="true">◉</span>{" "}
        {backend.info?.configured === false
          ? "Set up compute"
          : backend.info?.transport.toLowerCase() === "local"
            ? "Local"
            : backend.info?.transport.toLowerCase() === "ssh"
              ? "Remote · SSH"
              : "Compute"}{" "}
        <span aria-hidden="true">⌄</span>
      </button>
      {open && (
        <Modal
          className="fq-compute-dialog"
          label="Compute environment"
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <header>
            <h2>Compute environment</h2>
            <CloseButton
              label="Close compute environment"
              onClick={() => {
                if (!busy) setOpen(false);
              }}
            />
          </header>
          <p>
            Choose where future Python and circuit tasks run. Queued and running
            tasks keep their original environment.
          </p>
          {config && (
            <fieldset disabled={busy}>
              <label>
                Run on
                <select
                  value={config.transport}
                  onChange={(event) =>
                    edit({ transport: event.target.value as "local" | "ssh" })
                  }
                >
                  <option value="local">Local · Web service machine</option>
                  <option value="ssh">Remote · SSH</option>
                </select>
              </label>
              {config.transport === "local" ? (
                <>
                  <p>Local means the machine hosting this Web service.</p>
                  <label>
                    Python executable
                    <input
                      value={config.local_python}
                      onChange={(event) =>
                        edit({ local_python: event.target.value })
                      }
                      spellCheck={false}
                    />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    SSH command or host
                    <input
                      value={config.ssh_target}
                      placeholder="ssh -p 22 user@host"
                      onChange={(event) =>
                        edit({ ssh_target: event.target.value })
                      }
                      spellCheck={false}
                    />
                  </label>
                  <p>
                    Paste a connection command or host alias. Supports -p, -l
                    and -i. Interactive flags such as -CAXY are omitted; agent
                    and X11 forwarding stay disabled.
                  </p>
                  {connectionPreview && (
                    <p role="status">{connectionPreview}</p>
                  )}
                  <label>
                    Remote Python executable
                    <input
                      value={config.remote_python}
                      onChange={(event) =>
                        edit({ remote_python: event.target.value })
                      }
                      spellCheck={false}
                    />
                  </label>
                  <details>
                    <summary>Connection details</summary>
                    <label>
                      SSH port
                      <input
                        type="number"
                        min={1}
                        max={65535}
                        value={config.ssh_port}
                        onChange={(event) =>
                          edit({ ssh_port: Number(event.target.value) })
                        }
                      />
                    </label>
                    <label>
                      Identity file on Web service machine
                      <input
                        value={config.ssh_identity || ""}
                        placeholder="~/.ssh/id_ed25519"
                        onChange={(event) =>
                          edit({ ssh_identity: event.target.value })
                        }
                        spellCheck={false}
                      />
                    </label>
                    <label>
                      Local archive reader Python
                      <input
                        value={config.local_python}
                        onChange={(event) =>
                          edit({ local_python: event.target.value })
                        }
                        spellCheck={false}
                      />
                    </label>
                    <p>
                      Remote .fqx previews also need FlagQuantum installed in
                      this local interpreter.
                    </p>
                    <p>
                      Uses the service machine’s SSH configuration and known
                      hosts. Configure keys and host trust there; credentials
                      stay outside the browser.
                    </p>
                  </details>
                </>
              )}
            </fieldset>
          )}
          {error && <p role="alert">{error}</p>}
          {check && (
            <div className="fq-compute-checked" role="status">
              <strong>Environment ready</strong>
              <p>
                Python {check.runtime.python} · FlagQuantum{" "}
                {check.runtime.sdk_version || "available"}
                {check.runtime.pytorch
                  ? ` · PyTorch ${check.runtime.pytorch}`
                  : ""}
              </p>
              <p>SDK execution and archive round trip passed.</p>
              {check.runtime.synth_supported !== undefined && (
                <p>
                  {check.runtime.synth_supported
                    ? "Synthesis API available; each program still requires synthesis and validation."
                    : "Synthesis API unavailable in this SDK build. Circuit execution remains available."}
                </p>
              )}
            </div>
          )}
          <footer>
            <span>
              {busy
                ? "Checking or applying environment…"
                : "No automatic fallback to another machine."}
            </span>
            <button
              disabled={busy || !config}
              onClick={() => void perform(false)}
            >
              Check environment
            </button>
            <button
              className="primary"
              disabled={busy || !check}
              onClick={() => void perform(true)}
            >
              Use environment
            </button>
          </footer>
        </Modal>
      )}
    </>
  );
}
