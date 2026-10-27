# CLI first open-source release

The first public FlagQAI product is the standalone `@flagqai/cli` package.
CLI sessions, agent execution, tools, approvals, and persistence continue to
use DeepSeek Harness. Web and native Desktop remain separate workstreams; their
source and release decisions are outside this milestone.

## Release boundary

- `apps/cli` is source-derived from dsh-TUI v0.14.0. Keep its original MIT
  license, exact source provenance, and the licenses of bundled dependencies.
- FlagQAI additions carry the repository Apache-2.0 license. The tarball must
  include the MIT, BSD-3-Clause, and Apache-2.0 notices; run
  `npm --prefix apps/cli run verify:package`
  against the staged, relocatable package.
- Optional portrait PNGs and animation-frame binaries were not imported into
  this repository or the staged tarball. The previously embedded 30×30
  portrait sprite has been removed from the current source and package;
  without optional local artwork the UI uses the licensed pixel whale. The
  old sprite remains in private Git history and its underlying artwork claim
  has not been independently cleared for opening that history. See the
  [source review](SOURCE_PROVENANCE_AUDIT.md).
- Separately licensed native Desktop source was not imported. The present CLI
  source still requires a complete source-level review before public release.
  A fresh public repository can contain **one initial commit** from a
  separately reviewed source snapshot. Keep this
  private repository and its older blobs private; do not push or mirror its
  Git refs to the new repository. Create a fresh Git object store (`git init`
  in a new directory); do not reuse a clone, worktree, or copied `.git`
  directory from the private repository. Before importing, record the approved
  source tree ID independently of the new repository. After its first commit, run
  `node docs/releases/verify-clean-initial-import.mjs <new-repo-path>
  <reviewed-tree-oid>` to compare the exact committed tree and ensure only
  that root commit, one branch, no remotes, and no private unreachable objects,
  alternates, grafts, or shallow history remain. Add the intended public remote
  only after this check and the separate source review. This check does not
  establish rights to the files in the snapshot: resolve the current-source
  review first.
- The intended target `flagos-ai/FlagQAI` already has a public LICENSE-only
  root, `31e87d4723e530f08d68371798729a618ea716bd`. To preserve that history,
  prepare an isolated object store containing only that approved public root
  and one reviewed source-import commit. Preserve the LICENSE and record the
  approved source tree independently. Before adding the public remote, run:

  ```sh
  node docs/releases/verify-clean-initial-import.mjs <candidate-path> \
    <reviewed-tree-oid> \
    --public-license-base 31e87d4723e530f08d68371798729a618ea716bd
  ```

  This mode verifies the exact two-commit boundary and rejects extra refs,
  remotes, private unreachable objects, and license changes. It does not
  approve the snapshot's source rights or perform an import. Retaining the
  existing public root avoids a remote history rewrite. Do not use a private
  clone, worktree, or copied private `.git` to prepare either export mode.
- Do not publish `@flagqai/cli` or claim the first release is available until
  the remaining gates below are verified and the release is explicitly approved.
  The CLI package currently sets `"private": true`, including in the staged
  tarball, so npm refuses accidental publication. Remove that flag only in a
  separately reviewed release PR after the source-rights and dependency gates
  are resolved; local packing and installation remain available for testing.
- The source checkout and staged tarball are the supported pre-release install
  paths. The old one-click bundle was removed because it installed the still
  unpublished `@flagqai/cli` from npm. Reintroduce a registry installer only
  after publication, with an end-to-end install check against that release.

## Remaining release gates

1. Verify a fresh install from the staged tarball with an empty HOME/cache on
   supported macOS and Linux versions; check Windows startup separately in
   issue #67. The
   current Windows composition uses `danger-full-access` and approval policy
   `never`; do not describe it as sandbox-confined until a Windows backend is
   verified and the default is changed.
2. Exercise provider onboarding with an official route and a compatible relay,
   using test credentials or a controlled endpoint. Check error recovery and
   secret redaction without making unapproved paid model requests.
3. Verify session creation, resume, approval, cancellation, and the FlagQuantum
   tool path from the installed package with a scripted model and pinned MCP.
4. Run the repository PR preflight, relevant packaged acceptance, and CI for the
   exact candidate commit. Record environmental CI failures distinctly from
   code failures.
5. Reconcile the remaining imported dsh-TUI commands and user guide with the
   FlagQAI product identity. Keep compatibility aliases until a separate
   migration plan is tested. The packaged-guide wording and current-command
   examples are tracked in issue #259;
   this does not remove inherited profile names or data paths.
6. Complete a source-level license and provenance review before deciding which
   repository paths can be made public. Package verification alone cannot
   establish rights to all source files. Track reviewed and unresolved paths in
   [the source review record](SOURCE_PROVENANCE_AUDIT.md) and
   issue #86. The
   [upstream provenance finding](UPSTREAM_PROVENANCE_RISK.md) is a specific
   blocking part of this gate, tracked in
   issue #93. The
   [portion screen](UPSTREAM_PORTION_SCREEN.md) identifies the largest
   unchanged source blocks still present in modified files. Generate the
   [exact private source/tarball inventory](SOURCE_PROVENANCE_AUDIT.md) on the
   candidate commit before reviewing the final file boundary; a zero-finding
   inventory does not clear the remaining rights questions.
   The [independent terminal handoff](INDEPENDENT_TERMINAL_HANDOFF.md) records
   the behavior and access boundary needed for a defensible replacement;
   preparing it does not satisfy the source-rights gate.
7. Audit the platform-specific registry dependencies of an isolated install
   with the [installed dependency inventory](REGISTRY_DEPENDENCY_LICENSES.md).
   Issue #60 closed after the CLI tarball's optional-image notices and non-bundling boundary
   were verified in PR #203. The strict installed-tree inventory still reports
   platform-specific binaries for review. Any future bundled installed tree or
   standalone executable needs its own redistribution and source-access review.

No npm publication or repository visibility change is performed by this
checklist or its verification scripts.

The offline provider gate can be rehearsed with
`node apps/cli/scripts/verify-quantum-task.mjs --clean-install` and
`node apps/cli/scripts/verify-quantum-task.mjs --clean-install --gateway`.
Both use an isolated HOME, a staged CLI tarball, pinned Harness, and a local
scripted model. They exercise rejected-key discovery, retry, credential
redaction, process restart, and a Bell-state tool task without paid requests.
These checks do not establish connectivity to any live provider, and the
Windows startup gate remains separate.

`node apps/cli/scripts/verify-quantum-task.mjs --clean-install --interactions`
also checks native Harness approval and cancellation through the installed
server/SDK with the scripted model. It requires an approval before an isolated
fixture write, verifies a one-shot answer and settled event, then cancels a
pending model request and waits for terminal turn and stopped-control evidence.
Add `--ink-attach` to exercise the installed opt-in Ink terminal against the
same real Harness service and local scripted model: replay the completed Bell
session, submit a follow-up, answer a native permission request, cancel a
pending turn, detach, and restore the terminal. This does not use a paid model.
The CI workflow requests this fixture check on Ubuntu Node 22, plus the
Anthropic-compatible gateway variant there. macOS combines the interaction
check with the pinned MCP acceptance below. Earlier GitHub Actions attempts
were rejected at zero steps by an account payment/spending limit; check the
exact candidate's current CI jobs for actual results.

`node apps/cli/scripts/verify-quantum-task.mjs --clean-install --real-mcp --vqe`
adds a scripted-model VQE task through the installed CLI, Harness, and pinned
`flagquantum-mcp-server==0.3.2`. It asserts one actual
`train_parameters_tool` call in Harness history, then independently checks the
returned angle against the retrospective two-qubit Hamiltonian's exact parity
block eigenvalue and energy variance, both within `1e-4` and 150 optimizer
steps. It also runs the installed CLI's six-tool molecular H2 research preflight
against the public pinned MCP before the scripted model task. The Hamiltonian's
identity term is added back after training because
the pinned MCP rejects identity-only observables. This fixture is the
**electronic** H2/STO-3G Hamiltonian at `r=0.7350 Å` and excludes nuclear
repulsion: its exact energy is `-1.857275030202 Ha`; adding
`E_nuc=0.719968994449 Ha` gives `-1.137306035753 Ha` total. Do not compare
the electronic figure directly with the separate `r=0.7414 Å` total-energy
experiment. This is a transport and
scientific regression for a scripted model, not proof that an arbitrary live
model will choose FlagQuantum. The independent verdict is owned by the test;
the product evidence API still reports `scientificResultValidated: null`.
Its separate `vqeNumericalEvidence` field recomputes energy, the exact
two-qubit ground bound, variance, and returned-loss agreement from the
Harness-recorded trainer call. It reports `passed` only for the documented
three-gate parity QIR ansatz and four Pauli terms sent to the tool; other
circuits and Hamiltonians are `unsupported`. This is a narrow numerical check
of the tool return, not molecular-model or full scientific validation.
An MCP response envelope that reports failure cannot be upgraded to passing
numerical evidence by a nested `status: success` training payload. The runtime
records `TRAINING_RESPONSE_FAILED` even when the Harness transport itself
returned normally.

`node apps/cli/scripts/verify-quantum-task.mjs --clean-install --real-mcp --research-vqe`
is the separate research-capability acceptance. It uses the public pinned MCP
and a scripted model to call `execute_local_capability_tool` once for the
two-qubit H2 electronic Hamiltonian, then calls both validators recorded in the
returned Evidence Bundle. The test checks the Harness session's call/results,
the runtime's digest-bound validator observations, and independently recomputes
the energy, variance, and weight-one exact ground bound from the returned
statevector. The runtime's separate `researchVqeNumericalEvidence` field now
recomputes the two-qubit weight-one Pauli-sum energy, variance, and exact sector
bound from the Harness-recorded request and returned statevector. It is a
bounded numerical check, not verification that the supplied Hamiltonian models
the intended molecule; unsupported inputs remain unverified. The runtime still
reports `scientificResultValidated: null`. Neither
scripted route establishes how an arbitrary live model will behave.

The public `flagquantum-mcp-server==0.3.2` distribution requires
`flagquantum>=0.3.1,<0.4` and includes the six-tool research-capability contract.
The former 0.3.0 public distribution resolved `flagquantum>=0.2,<0.3` and lacked
those tools; a distinct local same-version wheel was not a reproducible release.
Molecular H2 ground-state requests supplied as explicit CLI task text now
select a separate research preflight:
all six tools must be present, a five-evaluation local VQE probe must return
native evidence, its energy and variance must agree with an independent
calculation, and both recorded validators must pass. The published 0.3.1 wheel
can pass this probe; that does not validate the user's later scientific calculation.
Before starting MCP, the preflight creates, writes, and syncs a small temporary
file in the task workspace and each effective uv cache/tool/Python directory.
A quota or filesystem write failure therefore returns a structured error before
model inference. This proves basic writability, not that enough free space or
memory remains for a cold scientific dependency installation.
For the default `uvx` launcher, preflight also checks the effective uv cache,
tool, and Python volumes before startup and every five seconds while MCP is
starting. It stops the installer with `insufficient_disk_space` if any volume
falls below a 2 GiB free-space floor. This protects remaining host space; it
does not promise that 2 GiB is enough for a first-time scientific install.
The Linux x64 cold-cache attempt recorded in issue #197 was stopped after its uv cache reached 4.0 GB without completing MCP discovery.
Installed CLI setup now puts the 0.3.1 MCP in its managed runtime instead of
installing it at each startup. Before and during that `uv tool install`, setup
checks the managed tool, bin, cache, and Python volumes and stops if any has
less than 2 GiB free. This is a host-space safety floor, not a claim that a
cold install needs only 2 GiB or that Linux x64 cold installation has passed.
The installed-package regression for this path runs with
`FLAGQAI_ACCEPTANCE_QUANTUM_FIXTURE=1 node apps/cli/scripts/verify-installed-first-run.mjs`;
it uses a scripted MCP, an isolated HOME, and no Provider request.
An interactive `flagqai quantum` launch without task text initially probes
the generic circuit and two-qubit trainer routes. A later molecular H2/VQE
request in that FlagQuantum session, including a resumed session, triggers the
six-tool research probe on the native input FIFO before Harness accepts the
message. Failure blocks that message before model inference. This is outside
the one-second plugin-decision budget, so a slow MCP check cannot time out
into an unverified model request. Standard sessions are unaffected; the public
0.3.1 distribution provides the research tools.
An interactive scientific calculation that the conservative intent classifier
recognizes but has no verified MCP route also stops at this boundary with an
explicit unsupported-task error. Ordinary conversation and coding requests
continue through the native Harness path.

The interactive `flagqai quantum` entry has no task text at startup, so its
preflight checks both currently supported pinned MCP paths: Bell-state circuit
simulation and a one-step VQE training call. A missing or failing trainer now
stops the interactive launch before a model request. A positional circuit
simulation task still checks only its required primary path; unsupported task
types are not advertised as verified. A ready preflight is not evidence that
the later agent actually called FlagQuantum or passed scientific acceptance.

On main `d4303017cc3b9be9cb202130c8bd49deeb6e19e7`, both installed-package
variants passed locally in separate fresh Linux arm64
`node:22-bookworm-slim` containers (Node 22.23.3/npm 10.9.9). Each installed
the staged CLI and managed Harness 0.2.0-rc.2 in an isolated HOME. The
scripted model and deterministic MCP fixture completed the Bell simulation,
OpenQASM export, and evidence-file write; an API restart restored the session,
an explicit approval allowed one isolated write, and cancellation stopped a
pending model request. The gateway run used the Anthropic-compatible message
format. Neither run used a live Provider, host credentials, or a paid request.
This is Linux arm64 local evidence, not hosted Ubuntu x64 CI success.

On main `67335b62877752ade358c51c005fffdd5ca0b360`, the ordinary and
Anthropic-compatible gateway variants also passed in separate fresh
`linux/amd64` Node 22.23.3/npm 10.9.9 `node:22-bookworm-slim` containers.
Both ran `verify-quantum-task.mjs --clean-install --interactions` (with
`--gateway` for the second run), installed the staged CLI and managed Harness
0.2.0-rc.2 in isolated homes, and passed provider retry/redaction, approval,
cancellation, Bell simulation, OpenQASM export, evidence-file write, and
session restart/resume. The model and MCP were deterministic fixtures; neither
run used a live Provider, host credentials, or a paid request. This confirms
local Linux x64 behavior at that source head, not a hosted GitHub runner result
or Windows compatibility. The same two commands can be repeated with
this container invocation, adding `--gateway` for the second run:

```sh
docker run --rm --platform linux/amd64 -v "$PWD:/repo:ro" -w /repo \
  node:22-bookworm-slim sh -lc \
  'node apps/cli/scripts/verify-quantum-task.mjs --clean-install --interactions'
```

Clean Linux arm64 (Node 22.23.2/npm 10.9.8) and Linux x64 (Node
22.23.3/npm 10.9.9) containers have installed the staged tarball into an
empty HOME, completed `flagqai setup`, and passed `flagqai doctor`. This
verifies first-run installation on those platforms. The reproducible
`node apps/cli/scripts/verify-installed-first-run.mjs` now runs with its PTY
probe enabled in the Ubuntu Node 22 and macOS Node 24 CI jobs. Ubuntu uses
the source-only `linux-script-pty.cjs` adapter over util-linux `script(1)`;
macOS installs a separate `node-pty` test driver in the runner's temporary
directory. Neither is a CLI runtime dependency. The PTY gate also checks
draft typing, left-arrow and backspace editing, and Ctrl+C clearing before
any model request. The Unix CI jobs now switch to a custom provider backed by
a loopback-only scripted model, submit one task in the installed TUI, require
the Agent response in the terminal, verify the request used that provider,
and exit cleanly. This does not use host credentials or a paid model. These
expanded CI checks have not produced a runner result while GitHub Actions
refuses jobs at zero steps for account billing/spending-limit reasons.

An isolated Linux x64 Node 22.23.3/npm 10.9.9 PTY opened the actual FlagQAI
TUI from the staged tarball after `setup`. Its onboarding and main screen
rendered, and `/exit` closed the process cleanly. On main
`58db83e471a659720357611ad4150346782ee6d7`, the same staged-package
probe passed in a fresh Linux arm64 `node:22-bookworm-slim` container (Node
22.23.3/npm 10.9.9): `setup`, `doctor`, the TUI command prompt, and `/exit`
with exit code 0. The container mounted the checkout read-only and installed
`node-pty@1.1.0` as a temporary test driver; it did not use host credentials
or request a model. That slim image needed `python3`, `make`, and `g++` to
build the driver. The probe can be repeated from the repository root with:

```sh
docker run --rm --platform linux/arm64 -v "$PWD:/repo:ro" -w /repo node:22-bookworm-slim sh -lc '
  apt-get update -qq && apt-get install -y -qq python3 make g++ >/tmp/build-tools.log &&
  npm install --no-save --prefix /tmp/flagqai-pty-harness node-pty@1.1.0 --no-audit --no-fund &&
  FLAGQAI_ACCEPTANCE_PTY_MODULE=/tmp/flagqai-pty-harness/node_modules/node-pty \
    node apps/cli/scripts/verify-installed-first-run.mjs
'
```

These local PTY results confirm interactive startup and exit on both Linux
architectures. They do not establish a complete interactive agent turn,
hosted CI success, or Windows startup.

The installed custom-provider wizard has also passed in a fresh Linux x64
Node 22 container using the source-only `script(1)` PTY driver. It discovered
`fixture-model` from a local HTTP endpoint, stored the fixture API key with
mode `0600`, kept the key out of the raw PTY transcript, edited and cleared a
draft, and exited cleanly. This used no host credential or paid model request.
Run the same clean-install check from the repository root with:

```sh
docker run --rm --platform linux/amd64 -v "$PWD:/repo:ro" -w /repo \
  -e FLAGQAI_ACCEPTANCE_PTY_MODULE=/repo/apps/cli/scripts/linux-script-pty.cjs \
  -e FLAGQAI_ACCEPTANCE_PROVIDER_WIZARD=1 node:22-bookworm-slim \
  node apps/cli/scripts/verify-installed-first-run.mjs
```

This is local Linux x64 evidence for the installed wizard and PTY driver, not
a hosted Actions result or a live provider connection.

A fresh Linux arm64 Node 22.23.3 staged-package install then passed `setup`,
`doctor`, the custom-provider wizard, a full local scripted Agent turn, and
`/exit` with code 0. The installed TUI displayed
`FLAGQAI_PTY_AGENT_READY`; the probe confirmed the submitted task and every
model request used the loopback fixture. Run this gate with
`FLAGQAI_ACCEPTANCE_AGENT_TURN=1` alongside the PTY module and provider
wizard variables above. This is scripted-model evidence, not a live-provider,
hosted CI, or Windows result.

The CI matrix includes a Windows Node 24 clean-install/setup/doctor probe and
now starts the installed TUI in a ConPTY, waits for its prompt, and sends
`/exit`. `node-pty` is installed only as a CI test driver, not as a CLI
runtime dependency. This gate has not produced a Windows runner result while
GitHub Actions refuses jobs at zero steps for account billing/spending-limit
reasons. Windows startup and exit remain unverified; issue #67
stays open until a real Windows run records the result.

On macOS arm64 with Node 26.8.2, the staged-package PTY probe passed again on
main `c430966eb5c496c0539a46eabd4aee1bb8231410` with
an isolated HOME and a warmed npm cache: it skipped first-run onboarding,
rendered the command prompt, selected `/exit`, and observed exit code 0. This
validates the test flow locally but is not a hosted macOS, Linux, or Windows
result on the new CI workflow.
