# FlagQAI

**Turning intent into testable quantum computation.**

FlagQAI's value lies in shortening the distance between a scientific question
and the quantum hardware that has to answer it. Conventional quantum
programming makes the developer design the circuit directly: which gates, in
what order, and how they map onto one specific device. Different machines have
different connectivity, native gate sets, and resource limits, so the same
algorithm can require a materially different implementation on each of them.

FlagQAI is built around a higher-level route: you state the computation you
want and the constraints that apply, and the system works out a circuit that
satisfies them. That is the same shift classical computing made from assembly
to compilers: developers today do not write per-processor instructions, because
mature compilers absorb that translation and optimization. Quantum computing
needs that layer too.

> **Where this stands today.** The synthesis layer described above is the
> product direction, not a finished capability. The verified slice in this
> release is much narrower: local circuit simulation and one bounded two-qubit
> variational route with a fixed ansatz. What is already built is the evidence
> chain around those steps. Every claim below is separated into readiness,
> observed execution, and numerical validation, and none of the three is
> reported as another. This document marks the boundary wherever it matters.

## Why this is different

Three things are kept strictly apart. Passing one is never reported as passing
another:

| Layer | What it means |
| --- | --- |
| **Readiness** | The runtime and tools are installed and reachable. `flagqai doctor` and the startup preflight check this. |
| **Execution** | A tool call actually happened. This is read back from backend session events, not inferred from a successful exit code. |
| **Validation** | An independent numerical check passed. This is a separate computation, not a restatement of the tool's own report. |

A passing startup check does not mean a calculation is correct. A tool that
returned does not mean a scientific conclusion holds. The code records this
distinction in its own types: `scientificResultValidated` reports `null`
rather than a verdict it did not compute, and the evidence records name the
exact capability and validator that ran.

FlagQAI does not issue a general scientific-validity verdict, and no part of
this release is designed to produce one.

## Relationship to FlagQuantum

[FlagQuantum](https://github.com/flagos-ai/FlagQuantum) is the separate
Python/PyTorch quantum-computing framework. FlagQAI is the user-facing CLI
and local service that integrates selected quantum capabilities into
Harness-owned Agent workflows and presents their execution evidence.
DeepSeek Harness owns the Agent loop, tools, permissions and durable sessions;
FlagQuantum supplies quantum computation through the MCP integration.

`flagqai setup` installs the pinned `flagquantum-mcp-server==0.3.2` distribution
under managed Python 3.12. It does not clone FlagQuantum or track its `main`
branch. Framework features and backend validation in FlagQuantum do not
become FlagQAI capabilities automatically: exposure, compatibility and
end-to-end evidence must be verified for the pinned integration. See the
[repository ownership and integration boundary](docs/ARCHITECTURE.md#relationship-to-flagquantum).

## What you can do today

| Area | Available now |
| --- | --- |
| Scientific coding | Use the agent's coding and shell tools to develop and run local calculation scripts, inspect files, and iterate on experiments. Scientific libraries must be installed in your environment. |
| Quantum simulation | Use FlagQuantum MCP to simulate supported circuits locally, and export them as OpenQASM 3. |
| OpenQASM import | Turn OpenQASM text back into FlagQuantum IR with `import_openqasm_tool`, so exported text can be compiled, routed or simulated without being rebuilt. It reads the canonical subset FlagQuantum writes and refuses foreign text rather than approximating it. |
| Semantic analysis | Inspect gates, layers and parameters with `analyze_circuit_tool`, `describe_layers_tool` and `inspect_parameters_tool`; bind symbolic parameters before execution. |
| Compilation and optimization | Run target-independent compilation and optimization through `compile_circuit_tool` and `optimize_circuit_tool`. |
| Hardware mapping | Route a circuit onto line, ring, grid or a custom coupling map with `route_circuit_tool`, and compare the cost of several topologies with `compare_topologies_tool`. SWAP overhead is reported as `instruction_delta` rather than hidden. |
| Variational training | Run the supported two-qubit VQE training route for an explicitly supplied reduced Hamiltonian, with a fixed `two_qubit_single_excitation` ansatz. |
| Experiment records | Use the bundled Python helper to record metrics, checkpoints, caller-defined thresholds, environment metadata, and SHA-256 artifact manifests. |
| Execution evidence | Read observed FlagQuantum tool calls and backend session telemetry through the local service and SDK, including a narrow numerical check for the supported two-qubit VQE contract. |
| Persistent workflows | Create and resume sessions, review tool activity, answer permission requests, and cancel work. |

The pinned `flagquantum-mcp-server==0.3.2` exposes these through 27 MCP tools.
The CLI's **startup preflight verifies a narrower set**: circuit simulation,
the two-qubit trainer, and the six research-capability tools used by the
molecular route. OpenQASM emission and import are exercised by the installed
acceptance script, not by the preflight. Every other tool is callable by the
agent but is covered by neither, so its results rest on the evidence you read
from the session.

## Quick start

### Requirements

- Node.js **24+** and npm for the recommended development setup. Node.js
  22.19 or later is also accepted.
- pnpm **11.26.0** to build from source.
- [uv](https://docs.astral.sh/uv/getting-started/installation/) for initial
  FlagQuantum MCP setup. Its managed launcher uses Python 3.12.
- A supported model provider or compatible API gateway, with credentials and a
  model ID.

The quantum runtime runs on your computer. Initial setup may download Python and
substantial dependencies, including PyTorch. Allow time and disk space for it.
The optional scientific-record helper requires Python 3.9+ and uses only the
Python standard library.

### Build and install

The `@flagqai/cli` npm package is **not published**. Build a local tarball from
source:

```sh
pnpm --dir apps/cli install --frozen-lockfile
pnpm --dir apps/cli run compile
pnpm --dir apps/cli run verify:package
node apps/cli/scripts/pack-flagqai.mjs --out ./dist
```

The packer prints the generated tarball path. For the current `0.1.0` package:

```sh
npm install -g ./dist/flagqai-cli-0.1.0.tgz --omit=peer
flagqai setup
flagqai doctor
flagqai
```

`flagqai setup` installs the pinned Harness runtime, the FlagQuantum MCP, and
the CLI profile under a managed runtime directory. Normal startup runs that
installed MCP directly rather than resolving it through `uvx`. The first setup
may take several minutes. No global Harness installation is required.

Inside FlagQAI, open `/provider` to configure an official provider or a custom
gateway, then `/model` to select the route. Credentials are saved through the
Harness credential store.

### Plain coding without the quantum runtime

```sh
FLAGQAI_ENABLE_FLAGQUANTUM_MCP=0 flagqai
```

## Try a quantum calculation

Start FlagQAI in your workspace and ask:

> Create a two-qubit Bell state with H(0) and CX(0,1). Use FlagQuantum to obtain
> exact probabilities, export OpenQASM 3, and save the results in this workspace.

Expected probabilities are approximately `[0.5, 0, 0, 0.5]` in computational
basis order. This is local classical simulation. When assessing the result,
read the recorded tool activity rather than the final sentence of a reply.

## Record a scientific run

The bundled Python helper works directly from your own scripts, with no model
request. Save this as `integrate.py`:

```python
import math
from flagqai_science import start_run

run = start_run(
    {"task_id": "sin-integral", "description": "Integrate sin(x) on [0, pi]"},
    "./results",
)

# Composite trapezoidal rule; the analytical integral is 2.
steps = 10_000
dx = math.pi / steps
estimate = dx * (
    0.5 * (math.sin(0.0) + math.sin(math.pi))
    + math.fsum(math.sin(i * dx) for i in range(1, steps))
)
error = abs(estimate - 2.0)
tolerance = 1e-6

run.log_metric("integral", estimate, step=0)
run.record_validation("absolute_error", error, tolerance)
run.save_checkpoint({"steps": steps, "estimate": estimate})
run.finish("passed" if error <= tolerance else "failed")
print(f"integral={estimate:.10f}, absolute_error={error:.3e}")
```

Run it with the installed helper:

```sh
PYTHONPATH="$(flagqai science --pythonpath)" python3 integrate.py
```

The helper writes a run directory containing `result.json`,
`benchmark_meta.json`, checkpoints, and a SHA-256 `manifest.json`. It records
the measurements, thresholds, and status your script supplies; it does not
judge whether the science is right.

## Local service and SDK

Run the same agent runtime behind a local HTTP/SSE service:

```sh
flagqai serve --port 4096
```

Attach from another terminal:

```sh
flagqai attach http://127.0.0.1:4096 --cwd /path/to/workspace
```

The service supports session creation and resumption, messages, live events,
permission responses, and cancellation, and binds to loopback by default.
The in-repository [SDK](packages/sdk/README.md) exposes
`client.flagQuantumEvidence(resourceId)` for observed quantum tool activity and
`client.scienceTelemetry(resourceId)` for backend-owned session telemetry.

## Architecture

```text
Terminal CLI / attached terminal
              |
      Harness adapter / local service
              |
       DeepSeek Harness
         |          |
    Coding tools    FlagQuantum MCP
                         |
                Local quantum computation

Python calculation scripts --> Scientific run records and manifests
```

Harness owns agent execution, tools, approvals, and durable session state.
FlagQAI provides the terminal experience, service interfaces, the
scientific-record helper, and the quantum integration.

## Known boundaries

These are limits of the current release, not of the product direction.

**Quantum scope.** The routes the startup preflight verifies are
`simulate_circuit_tool`, `train_parameters_tool`, and the six
research-capability tools, pinned at `flagquantum-mcp-server==0.3.2`. The
variational route is bounded to two qubits with a fixed ansatz and an
explicitly supplied reduced Hamiltonian. It is not an end-to-end molecular
electronic-structure workflow, and it does not scale to chemically relevant
system sizes.

**Synthesis.** Describing a computation in functional terms and having the
system derive a circuit is the direction, not a shipped capability. The pinned
MCP compiles, optimizes and routes a circuit you already specified; it does not
choose an ansatz family, size a state-preparation routine, or trade
approximation error against gate count on your behalf. Compilation and routing
are circuit-to-circuit transforms, and `route_circuit_tool` reports its SWAP
overhead rather than producing a shorter circuit.

**Hardware.** Quantum hardware execution is outside the verified routes. Every
calculation documented here runs on a local simulator, and routing is verified
against synthetic coupling maps rather than a live device.

**Platforms and hosted CI.** The source candidate merged by
[PR #1](https://github.com/flagos-ai/FlagQAI/pull/1) passed the hosted Ubuntu
Node 22/24, macOS Node 24 and Windows Node 24 jobs. Clean installed CLI,
provider configuration, draft editing, a local scripted Agent turn and normal
exit were verified on Linux x64 Node 22, macOS arm64 Node 24 and Windows x64
Node 24. Ubuntu Node 24 runs source/package checks without that installed PTY
path. The [acceptance status](docs/releases/ACCEPTANCE_STATUS.md) pins the
commit, job links, package hashes and per-platform scientific coverage.
Linux arm64 has separate [historical source-build acceptance](docs/releases/LINUX_ARM64_ACCEPTANCE.md),
including its pin-specific compiler requirement; it is outside that hosted matrix.

Windows functional acceptance does not establish sandbox confinement. Its
current configuration still uses `danger-full-access` with approval `never`.
The hosted passes use local scripted model endpoints and do not verify live
model providers, QPUs or every FlagQuantum backend.

**Publication.** The npm package sets `"private": true` and is intentionally
unpublishable. Removing that flag is a separate, reviewed release decision.

## Roadmap

Work toward the next edition, in the order it blocks the positioning above:

1. Generalize beyond the two-qubit fixed-ansatz route: ansatz families,
   fermion-to-qubit mappings, and error mitigation, reusing established public
   implementations rather than reimplementing them.
2. Build the synthesis level above the existing compiler: a functional
   description that the system turns into a circuit, including ansatz choice
   and explicit approximation-error budgets. Compilation and routing already
   exist; deriving the circuit from intent does not.
3. Close the loop from model-proposed circuit to deterministic acceptance:
   structural checks, comparison against analytic references, and recorded
   evidence for each step.
4. Extend bounded execution to a tested hardware path, with the same evidence
   discipline that the simulator routes already follow.
5. Maintain the hosted acceptance matrix and separately verify the Windows
   permission/confinement policy before changing its support claims.

These are development directions, not available features.

## Development and documentation

- [CLI guide](apps/cli/README.md): configuration, commands, quantum preflight,
  and installed-package checks.
- [Architecture](docs/ARCHITECTURE.md): component responsibilities and runtime
  boundaries.
- [Local service](packages/server/README.md),
  [protocol](packages/protocol/README.md), and
  [SDK](packages/sdk/README.md): integration contracts.
- [Acceptance status](docs/releases/ACCEPTANCE_STATUS.md): exact hosted evidence,
  publication state, platform coverage and remaining limits.
- [Release checklist](docs/releases/CLI_FIRST_RELEASE.md): source review,
  dependency review, and platform acceptance.

To contribute, see [CONTRIBUTING.md](CONTRIBUTING.md). Report vulnerabilities
through the process in [SECURITY.md](SECURITY.md). Outstanding release gates are
tracked in the
[open-source readiness report](docs/releases/OPEN_SOURCE_READINESS.md).

## License and acknowledgments

FlagQAI-authored additions use [Apache-2.0](LICENSE), except where a file or
package carries another notice. The terminal implementation derives from
dsh-TUI v0.14.0 and retains its MIT notices. Bundled dsh-std and other
third-party components retain their respective licenses and attribution.

See [third-party notices](THIRD_PARTY_NOTICES.md),
[CLI distribution notices](apps/cli/OPEN_SOURCE_NOTICES.md), and
[upstream provenance](apps/cli/UPSTREAM.md) for details. The repository-level
license does not replace the licenses of imported components.


## Optional quantum workspace Web source

The optional React workbench lives in [`apps/web`](apps/web/README.md) following the
owner's explicit Web product decision. It preserves the local quantum editor,
recursive circuit visualization and CPU task/result workflow. Build and run it
with `pnpm web:install`, `pnpm web:build`, `pnpm web:doctor`, and `pnpm web`; it is not included in the native CLI
release tarball. Agent execution, sessions and permissions remain owned by Harness.
See [`docs/architecture/QUANTUM_WORKSPACE_WEB.md`](docs/architecture/QUANTUM_WORKSPACE_WEB.md)
for the integration and provenance boundary.
