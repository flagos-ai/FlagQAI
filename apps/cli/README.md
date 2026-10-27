# FlagQAI CLI

FlagQAI CLI is the terminal client of FlagQAI. Its initial implementation is
source-derived from dsh-TUI 0.14.0 and is maintained in this repository as
first-party source. It does not install or patch an external dsh-TUI package at
runtime.

The CLI package is named `@flagqai/cli` and starts with `flagqai` or `fq`.
User preferences and CLI history live under `~/.flagqai`; the native Harness
profile is named `flagqai`. Product environment variables use `FLAGQAI_*`.
Previous dsh-TUI commands, environment variables, and configuration directories
are not supported or automatically migrated. Configure the new profile with
`flagqai setup` and `/setup`.

For the first public CLI release, packaging is constrained to the reviewed CLI
surface. Optional portrait PNGs and animation-frame binaries were not imported.
The inherited embedded RGB portrait sprite has been removed from the current
source and package; its old blob remains in private Git history and must be
reviewed before that history is opened. Built-in terminal art remains
available. The CLI tarball includes upstream MIT, imported BSD-3-Clause, and
FlagQAI Apache-2.0 notices.
See [distribution notices](./OPEN_SOURCE_NOTICES.md) and the
[release checklist](../../docs/releases/CLI_FIRST_RELEASE.md).

## First use from a package

Clean installation and interactive terminal checks pass on macOS arm64
and Linux arm64/x64 in the tested environments. FlagQuantum 0.3.1 has no
Linux arm64 wheel, so that platform currently needs a C/C++ build toolchain
for `flagqai setup`; a minimal image without one fails before the interactive
checks. On Debian-based Linux arm64, install `build-essential` before setup;
the [Linux arm64 acceptance recipe](../../docs/releases/LINUX_ARM64_ACCEPTANCE.md)
records the tested image and commands.
The macOS API checks also cover the real pinned quantum runtime and a
scripted compatibility gateway. Remaining platform gates are
listed in the
[readiness report](../../docs/releases/OPEN_SOURCE_READINESS.md) before trying
the preview installation below.

The npm package is not published yet. To try the built tarball locally:

```sh
npm install -g /path/to/flagqai-cli-0.1.0.tgz --omit=peer
flagqai setup
flagqai
```

Use Node.js 22.19 or Node.js 24+, with npm. `flagqai setup` downloads the pinned
Harness 0.2.1-rc.2, pnpm 11.26.0, and the pinned FlagQuantum MCP into
`~/.flagqai/cli`, then creates a native
`flagqai` profile from the installed FlagQAI package. No global `dsh` or pnpm is
needed and setup does not fetch FlagQAI from the registry. Internet access is
required for dependencies. The first CLI release uses the Harness-backed DSH
session; an Anthropic API gateway is configured as a model provider, not as a
separate Agent backend. Re-running a ready setup does not reinstall it.
After replacing an older `0.1.0` preview archive, run `flagqai setup --refresh`
and confirm `flagqai doctor` reports Harness `0.2.1-rc.2`; the CLI version
alone cannot distinguish same-version preview archives.
`FLAGQAI_CLI_RUNTIME_ROOT` selects another managed directory.

On first launch, `/setup` shows local provider and credential status without
contacting a model endpoint. Choose **Configure provider** to open `/provider`
for an official API or a custom gateway. Supply the protocol, base URL, API key
and model ID for a gateway; verify connectivity before starting a task. Keys
remain in the native credential store. Restarting preserves provider settings
and sessions. `flagqai doctor` checks local runtime readiness and the managed
MCP executable; neither its checks nor the `/setup` status claim provider
connectivity has been verified.

When replacing a local preview tarball with another build that still reports
`0.1.0`, close running CLI sessions, install the new tarball globally, then run
`flagqai setup --refresh`. This reinstalls the CLI profile from the installed
package while reusing the pinned Harness and pnpm; it preserves local credentials
and sessions. Plain `flagqai setup` remains a fast no-op when the managed runtime
is already ready.
This preview package has no npm registry update target: `flagqai update`
and `/update` refuse registry self-update. Replace the tarball locally and use
`flagqai setup --refresh` instead.

The default `flagqai` session retains the Standard coding tools and mounts
FlagQuantum MCP. Install [uv](https://docs.astral.sh/uv/getting-started/installation/)
before `flagqai setup`; setup provisions the pinned MCP in a managed Python
environment. An installed `flagqai` session runs it directly without `uvx`
or dependency resolution at startup. `FLAGQAI_ENABLE_FLAGQUANTUM_MCP=0 flagqai` is an explicit
Standard-only escape for environments without Python tooling.
FlagQAI starts the pinned FlagQuantum MCP under Python 3.12 for both preflight
and native sessions. Initial setup may download Python and substantial PyTorch
dependencies; allow free disk space and time for this one-time setup.

For a reproducible local scientific run, the installed CLI also bundles an
optional Python 3.9+ artifact helper. It checks output and cache writability
before the run, records caller-supplied measurements and acceptance thresholds,
and writes `result.json`, `benchmark_meta.json`, and a SHA-256 `manifest.json`
atomically.

At packaging time it rechecks each file as a regular run-root file and
rejects a link substitution or a file changed while hashing. A packaging
failure leaves the recorded result intact and omits the manifest. These
checks do not make a model-writable directory tamper-proof or turn
caller-recorded validation into an independent scientific verdict.

No additional Python package is required for this helper:

```sh
PYTHONPATH="$(flagqai science --pythonpath)" python3 my_experiment.py
```

```python
from flagqai_science import start_run

run = start_run({"task_id": "h2-vqe", "description": "Two-qubit VQE"}, "./results")
# Execute the actual solver and independent validation in your own script.
run.log_metric("energy", -1.13, step=0)
run.record_validation("absolute_error", 0.00001, 0.0001)
run.save_checkpoint({"iteration": 0})
run.finish("passed")
```

The helper records supplied data and thresholds; `recorded_status` is not a
FlagQAI scientific verdict. Backend tool calls and permissions must be read
from the Harness-backed session telemetry. A failed manifest write leaves the
recorded `result.json` intact and raises `ArtifactPackagingError`. The local
deterministic two-qubit VQE fixture exercises the helper and packaging without
a provider request or a claim of FlagQuantum tool use.

For sessions opened through the local service, permission decisions are also
recorded in a private local journal keyed by the native backend/session ID.
The journal stores only a hashed request ID and the accepted outcome. It omits
prompts, command arguments, user comments and timestamps. The science telemetry
API reports a decision count only when the journal is complete; legacy sessions,
unreadable journals and interrupted decisions report `null`. Permission approval
is not counted as scientific human intervention, and Harness still makes the
permission decision.

Managed setup does not import existing profiles or credentials. If `DSH_HOME`
is explicitly set, launch keeps the existing profile workflow; the managed
home is selected only when that variable is absent. This preserves legacy and
standalone installations without silently moving user data.

To build a local package from this repository, build the CLI, then run:

```sh
node apps/cli/scripts/pack-flagqai.mjs --out /tmp/flagqai-packages
```

The packer materializes bundled workspace packages, verifies the distribution
boundary, and retains source notices; it does not publish anything.
Fresh-install acceptance uses an empty HOME/cache, registry-installed
dependencies, and no host module links:

```sh
node apps/cli/scripts/verify-quantum-task.mjs --clean-install
node apps/cli/scripts/verify-quantum-task.mjs --clean-install --gateway
node apps/cli/scripts/verify-quantum-task.mjs --clean-install --interactions
# Optional: use the real pinned MCP, retaining a scripted model.
node apps/cli/scripts/verify-quantum-task.mjs --clean-install --real-mcp
```

## Development

Requirements:

- Node.js 24 (Node.js 22.19 or newer is also supported upstream)
- pnpm 11

```sh
cd apps/cli
pnpm install --frozen-lockfile
pnpm build
pnpm tui
# after installing the package globally:
flagqai
```

The development entry uses the repository runtime helper and the compatible
profile contract inherited from the source baseline. Installed packages use
`flagqai setup` instead. Both paths delegate sessions, tools, provider settings
and agent execution to Harness; neither introduces a second agent runtime.

The source build also exposes the first headless local-service boundary:

```sh
flagqai serve                 # listens on 127.0.0.1:4096
flagqai serve --port 4100     # choose another loopback port
flagqai attach http://127.0.0.1:4096
flagqai attach http://127.0.0.1:4096 -- "inspect this repository"
```

This command starts a headless Harness composition and mounts the same DSH
session backend used by the terminal client. HTTP clients
can create or resume real persisted sessions, submit messages, cancel work,
consume history plus live events over SSE, and answer interactive permission
or structured-question requests through the service protocol. The headless
host mounts dedicated Harness answerers for these interactions; it does not
create a second approval or question state machine.

`attach` is the first SDK-backed remote CLI path. It opens a new session by
default, accepts `--session <backend-session-id>` to resume persisted backend
history, and accepts `--resource <api-resource-id>` to reconnect to a session
that is still mounted in the running server. Use `/cancel`, `/status`,
`/model` to list Harness-owned model choices, `/model <number>` to switch an
idle session, `/plan [on|off]`, `/mode [number]`, and
`/effort [number|auto]` to inspect or change native Harness controls, and
`/image <local path>` to stage a PNG, JPEG, WebP, or GIF for the next text
message. `/image` lists the local draft; `/image remove <number>` and
`/image clear` discard it. The CLI checks the live session's image capability
and the protocol's per-image and aggregate size limits before reading the
file. Only the explicit submitted message sends its image bytes to the service.
Relative paths resolve from the attach process's current directory. Use
`/dispose` to dispose the resource or `/exit` to detach. Control choices are read from the
live session and changes require an idle session. A successful model switch
replaces the API resource and prints its new reattach command. If the switch
receipt is lost, inspect the native session before retrying. Remote services
require HTTPS;
plain HTTP is restricted to loopback endpoints. In a non-interactive attach,
permission prompts are rejected and question prompts are cancelled. Secret
question input is also cancelled until the remote terminal client can mask it.

During an active attach task, Ctrl+C requests cancellation and exits with code
130; the receipt is bounded to five seconds and does not claim the task has
already stopped. If cancellation cannot be confirmed, inspect the session before
retrying. SIGTERM (exit 143) and `/exit` only detach; server work may continue.
An unexpected stream closure or reset returns exit 1 with resource and native
session recovery hints. Messages are never automatically resubmitted.
Use `--timeout <seconds>` with a one-shot prompt to set an optional deadline;
expiry detaches without cancelling. No task deadline is imposed by default.
Reattach with `--resource` while the server is running, or with `--backend`,
`--session` and the original `--cwd` after a server restart.

The `web` and `desktop` commands are reserved for later editions and return a
clear unsupported message in this CLI-first repository.

## First quantum task

Start `flagqai`, open `/provider`, and choose a catalog provider or a custom
endpoint. For a Claude-compatible gateway select `anthropic-messages`; enter
the gateway's model ID rather than guessing it from the product name. The key
is saved in the Harness credential store; profile configuration stores its
reference. Use `/model` to select the saved route.

Start `flagqai` for both coding and quantum tasks. New native sessions preflight
the pinned `flagquantum-mcp-server==0.3.2` and mount its preset before accepting
the first prompt; the preset includes the complete Standard coding tools. A
managed Linux installation resolves CPU-only PyTorch for this local-CPU MCP,
avoiding CUDA wheel downloads. It requires a recent uv with `--torch-backend`
support (verified with uv 0.12.16). On Linux arm64 the current pinned
FlagQuantum release also needs a C/C++ compiler to build from source until an
arm64 wheel is available. Existing Linux installations should run
`flagqai setup` once to replace the earlier default PyTorch resolution. A clear
calculation supplied as a positional startup prompt receives a
task-specific preflight. An ordinary coding prompt uses the generic interactive
preflight, so later scientific requests can use the same session. The first
source-checkout launch may download Python dependencies. A missing managed MCP
or MCP startup failure stops installed startup before any model request. This preset uses
the declarative registry in Harness 0.1.7 or newer; the supported development
runtime is 0.2.1-rc.2.

Utility commands, explicit non-DSH backends and preset overrides keep their
existing behavior.
An explicitly resumed Standard session retains its recorded preset and cannot
acquire MCP mid-turn; start a new `flagqai` session for quantum work. Mounting
a tool does not prove that an agent called it. Startup first checks that the
workspace is writable, starts the pinned
`flagquantum-mcp-server==0.3.2`, discovers its MCP tools, and executes a tiny
local Bell-state simulation to catch SDK import and execution failures before
model inference. For VQE, it also executes a one-step, two-qubit trainer probe
against the pinned MCP, so a listed but unusable trainer fails before any model
request. This probe does not consume the user's task or count toward its
evaluation budget. A generic two-qubit VQE task requires
`train_parameters_tool`; a molecular H2 ground-state task requires the six
research-capability tools listed below. A Bell-state or circuit-simulation task
requires `simulate_circuit_tool`. Tasks outside these verified routes fail
explicitly before MCP startup instead of silently inheriting a simulation route.
Missing tools or MCP startup errors stop the task before the first model request. The session also
refuses its first model request if the selected preset fails to mount
FlagQuantum MCP tools. This smoke test does not prove VQE correctness or that a
live model actually uses FlagQuantum; the remaining
environment and routing work is tracked in issue #148.

The machine-readable preflight report includes the matched capability and
primary tool, pinned package, MCP server identity, discovered and required
tools, completed `runtimeChecks`, and workspace status. The preflight
checks the uv cache for write access before starting MCP: it uses
`UV_CACHE_DIR` when set and otherwise asks `uv cache dir` for uv's effective
default. A missing uv installation, invalid cache configuration, or unwritable
cache fails before model inference. A failed check
returns a nonzero exit code and a structured error. This report is readiness
evidence only: `toolUseObserved` is false and `scientificResultValidated` is
null until a real session and independent acceptance provide those facts.
After a session runs the supported two-qubit parity VQE trainer, the local
server's `flagquantum-evidence` endpoint also reports
`vqeNumericalEvidence`: an independent check of the Harness-recorded tool
arguments and result. It stays `not_observed`, `incomplete`, or `unsupported`
outside that narrow contract. A passing numerical check does not establish
chemistry-level validity; `scientificResultValidated` remains null.
When a source checkout uses `uvx`, preflight also checks uv's effective tool and
Python install directories. In a sandbox that cannot write under `$HOME`, set
`UV_CACHE_DIR`, `UV_TOOL_DIR`, and `UV_PYTHON_INSTALL_DIR` to writable absolute
paths before starting FlagQAI. These paths can use substantial disk space on
first install. An unwritable path fails with a specific error before MCP startup.
During MCP startup, the human-readable CLI reports the current phase and
elapsed time every 30 seconds. A cold dependency install may take several
minutes; the startup probe stops after ten minutes with `mcp_timeout` rather
than waiting indefinitely. Press Ctrl-C to cancel. Machine-readable preflight mode writes no progress messages to stderr.

The public `flagquantum-mcp-server==0.3.2` distribution requires
`flagquantum>=0.3.1,<0.4` and includes the six research-capability tools
(`search_capabilities_tool`, `describe_capability_tool`,
`validate_capability_input_tool`, `estimate_capability_tool`,
`execute_local_capability_tool`, `validate_evidence_tool`). A successful generic
trainer preflight still does **not** verify the molecular research route; use an
explicit molecular task for its six-tool check. The old public 0.3.0 wheel lacks
these tools and must not be substituted for 0.3.2.
Explicit molecular ground-state requests such as “Calculate H2 ground-state
energy with VQE”, entered in a `flagqai` session, require all six research tools. The check
executes a bounded five-evaluation local VQE probe, rechecks its energy and
variance from the returned statevector, and calls both recorded validators.
The 0.3.2 build passes this route only when its actual MCP tools and bounded
research execution validate. This preflight does not validate the user's later
molecular result. The generic two-qubit VQE trainer route remains available for
explicitly reduced two-qubit Hamiltonian tasks.
An interactive `flagqai` launch without task text preflights the two generic
routes. If a molecular H2/VQE request is typed later in that
FlagQuantum session, the native input path runs the six-tool research probe
before delivering that message to Harness. A failed probe reports the error
without making a model request. This also applies when a FlagQuantum session
is resumed. Explicit Standard-only sessions remain unaffected. A passing probe does
not prove that the later Agent used FlagQuantum or validated the user's result.

Ask: “Create a two-qubit Bell state with H(0) and CX(0,1), obtain exact
probabilities, export OpenQASM 3, and save the results in this workspace.”
This uses local classical simulation, not quantum hardware. Expected
probabilities are approximately `[0.5, 0, 0, 0.5]` in computational basis order.

For a session opened through `flagqai serve`, the SDK's
`client.flagQuantumEvidence(resourceId)` reads the complete Harness event
history and reports actual `mcp__flagquantum__*` calls, returned calls, failed
calls, and calls still pending. The result never reads model-authored answers or
result files. A returned tool call proves only that the tool did not report an
error; it does not prove that a VQE calculation used FlagQuantum as its primary
solver or that the numerical result passed independent validation. A zero-call
report means no FlagQuantum MCP call was observed in that session. This is the
first evidence step from the VQE retrospective; automatic task routing,
environment preflight, schema validation, and scientific acceptance still need
separate work.

The repository's `verify-quantum-task.mjs --clean-install --real-mcp --vqe`
regression uses the real pinned MCP with a scripted model and checks the
retrospective two-qubit result independently. It verifies that specific tool
route and numerical result. Its Hamiltonian is the **electronic** H2/STO-3G
Hamiltonian at `r=0.7350 Å`: the asserted exact electronic energy is
`-1.857275030202 Ha`; adding nuclear repulsion `0.719968994449 Ha` yields the
total `-1.137306035753 Ha`. It is not the total-energy H2 result at
`r=0.7414 Å`. The CLI does not yet provide a platform scientific acceptance
verdict.

For comparable tool counts across supported backends, the local service also
exposes `client.scienceTelemetry(resourceId)`. It projects turn boundaries and
tool calls/results from durable backend-owned session history. The projection
omits tool inputs, outputs, and model-authored
claims. It marks missing or out-of-order timestamps instead of inventing
durations. Accepted permission decisions are counted from a separate local
durable journal without inventing event timestamps; missing or incomplete
journals remain unknown. A returned tool
call only means the transport did not report an error; this API does not write
`trace.jsonl`, validate result schemas, count scientific human interventions,
or replace independent scientific acceptance.

For a service session using the same preset:

```sh
FLAGQAI_PRESET=flagquantum flagqai serve
flagqai attach http://127.0.0.1:4096 --cwd /path/to/workspace -- "Create a Bell state, simulate it and save OpenQASM."
flagqai attach http://127.0.0.1:4096 --session <native-session-id>
```

Interactive attach displays the native session ID. `--session` restores its
durable history after restarting the service; `--resource` reconnects only to
a currently mounted resource. One-shot attach exits successfully only for a
completed turn. Error, blocked, aborted or interrupted turns return exit 1;
inspect the retained session before retrying. Failed individual tools remain
visible in history and the agent can recover from them.

Run the clean-install acceptance commands above from the repository root. They
stage and install the current CLI package in a disposable home and use a scripted
model; the optional `--real-mcp` variant launches the pinned FlagQuantum MCP
without a paid model request. These checks cover package relocation, provider
configuration and the Bell-task tool path. `--interactions` additionally checks
a real Harness approval request/answer and cancellation of a pending turn through
the installed local API. They do not prove live provider
connectivity or model quality.

An opt-in `--live` probe uses an explicitly supplied existing route. Set
`FLAGQAI_ACCEPTANCE_LIVE_PROFILE` to its profile patch,
`FLAGQAI_ACCEPTANCE_LIVE_DSH_HOME` to its credential home,
`FLAGQAI_ACCEPTANCE_LIVE_ROUTE` and `FLAGQAI_ACCEPTANCE_LIVE_MODEL` to the saved
route/model. It saves only the selected credential into the private disposable profile,
uses real FlagQuantum MCP, and sends only the Bell task and workspace history.
It leaves the source profile unchanged. Live provider calls incur their normal
usage costs and are never part of deterministic CI. These checks are integration
evidence; they do not assert central scientific acceptance or benchmark success.

## Source history

See [UPSTREAM.md](UPSTREAM.md) for the exact source revision, imported paths,
license obligations, and the rules for future synchronization. The original
English readme is retained as [UPSTREAM_README.md](UPSTREAM_README.md) for
historical context. See the [source review record](../../docs/releases/SOURCE_PROVENANCE_AUDIT.md)
for the additional directly copied or ported source in this repository.
