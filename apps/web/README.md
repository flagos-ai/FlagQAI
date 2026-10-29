# Optional React quantum workspace

This source application is enabled by the owner's explicit 2026-10-29 product decision.
It is separate from the CLI release artifact and introduces no alternative Agent runtime.

## Build and run locally

Requires Node.js 24+, pnpm and Python 3.9+. No model call is needed to build or test.

```sh
pnpm cli:install
pnpm cli:build
# If the native Harness is not already set up (explicit dependency installation):
node apps/cli/bin/flagqai.js setup
pnpm web:install
pnpm web:check
pnpm web:build
pnpm web:doctor
pnpm web
```

Open http://127.0.0.1:4187. `FQ_PORT=4188 pnpm web` selects another loopback port.
`pnpm web` checks prerequisites, reuses a healthy native Agent service on 4096 or
starts the existing CLI's `flagqai serve`, then starts the workspace host. Ctrl-C
stops only processes started by this launcher. Existing services are never killed
or replaced. This entry sends no model prompt, installs no dependency and creates
no alternative Agent runtime. `pnpm web --no-agent` starts only the workbench.

`pnpm web:doctor` checks assets, Node/Python, Agent readiness and the local `.fqx`
reader without starting services. `pnpm web:doctor --probe` additionally checks
configured SSH access and imports FlagQuantum/PyTorch remotely; it runs no circuit,
does not modify SSH trust and installs no package. WARN means editing is available
but a capability needs configuration; ERROR prevents startup. Provider readiness
is still checked by the native Harness when connecting or sending a task.

Computation requires either existing SSH access to a FlagQuantum environment or an
explicit local runtime:

- SSH: `FQ_SSH_TARGET`, optional `FQ_SSH_PORT` (2222), and optional
  `FQ_REMOTE_PYTHON`. These may also come from ignored local settings.
- Local: `FQ_COMPUTE_TRANSPORT=local` and `FQ_LOCAL_PYTHON=/path/to/python` with
  FlagQuantum and PyTorch installed. There is no automatic SSH fallback.
- `.fqx` reading: `FQ_EXPERIMENT_PYTHON=/path/to/python` with official SDK
  `fq.save`/`fq.load` support. The Web host itself requires only Python's stdlib.

The launcher does not install the SDK or alter a shared remote environment.
Machine identities, SSH keys, provider credentials and databases stay outside Git.
Ignored `.flagqai/quantum-workspace/settings.json` may contain `ssh_target`,
`ssh_port`, and `remote_python`. `FQ_DATABASE_PATH` selects an existing pilot
SQLite job database; do not run two task-serving hosts on it concurrently.
`FQ_HARNESS_PORT` selects the native service port, and `FQ_AGENT_CWD` selects the
workspace used for native history and linked model files.

The host serves ignored `apps/web/dist`; `FQ_WEB_ROOT` overrides this path.
The lower-level `python3 packages/quantum-workspace/serve.py` remains available
for deployments that already manage the native service themselves.

## Architecture

- `src/pages`: Model, circuit visualization, execution and measurement results.
- `src/components`: focused React rendering, resize controls, libraries and Agent panel.
- `src/hooks`: application operations, panel size and lifecycle-managed refresh.
- `src/state`: typed reducer, browser-storage compatibility, templates and exports.
- `src/api`: computation requests and the existing shared FlagQAI SDK.
- `packages/quantum-workspace/domain`: pure hierarchy and bounded source diagnostics.
- `packages/quantum-workspace/local`: optional fixed-driver local computation adapter.

No legacy script, global render wrapper, iframe or `innerHTML` rendering is mounted.
Source changes are undoable. Selected program snapshots never replace the editor draft.
Late compiler results do not navigate away from a newer draft. Both source/compiled gate
views, nested modules, register buses, node information, downloads, notebook export,
configuration, local templates and job results remain available.

Browser storage keys from the pilot are read on first use at the same origin. The typed
React snapshot is `fq-react-workspace-v1`; editor changes also update `fq-code`/`fq-name`.
Panel sizes retain `fq-pane-layout-v1`; compiled records retain
`fq-quantum-programs-v1`. Different ports have different browser storage. To preserve a
pilot draft, serve this build on its original origin after stopping the previous host.
The database remains a local computation history, not an Agent session log.

## Agent boundary

The Agent panel connects through `packages/sdk` to the native FlagQAI local service.
Start `flagqai serve --port 4096`, then choose **Connect** in the dock. The Python
workspace host proxies a bounded set of session APIs to loopback port 4096
(`FQ_HARNESS_PORT` overrides it for isolated development). It restricts sessions to
the repository working directory and rejects foreign origins. No model request is
sent automatically, and provider credentials remain in the native Harness.

Native `session.view` projections drive incremental replies, reasoning disclosures,
tool arguments, live output, final results and rollback. Permission and question
cards submit decisions to the native APIs; Stop requests native cancellation.
Reconnect uses event cursors, and History resumes native durable sessions. Only the
active session reference and composer draft are saved in browser storage. Harness
owns execution, tools, permissions and persistence; the Web owns no second loop or
conversation log. Optional attached model/program source is sent as untrusted data
and collapsed in the transcript. Explicit attachment chips control each submission; no model is included by default.

Compute operations are not registered as new Agent tools by this change. Native
file-editing tools remain responsible for file mutations; the Web reads explicitly
linked OpenQASM exchange files as described below.

## Limits

The installed importer supports a subset of OpenQASM 2/3. Local lint is not proof of
compiler compatibility. Current CPU limits: 1–16 qubits, 2,000 gates, 32 KiB source,
1–100,000 shots, 90-second remote timeout, one active operation and four outstanding slots.
No QPU/GPU provider, automatic POST retry, submission idempotency or remote cancellation
is added. Worker/process errors are displayed rather than replaced by sample results.

### Precomputed gate example results

The gate reference's **Run example** action reveals verified saved before/after output.
The input snapshot is taken after demonstration preparation, immediately before
the marked gate operation. Measurement compares that input state with sampled
counts, rather than claiming a sample histogram is a single collapsed state. It
starts no Python process, remote job or paid model call. The UI identifies the
output as precomputed, records the SDK version, and refuses to display it when
the example source has changed. Seeded counts are one saved sample, not a claim
that every future execution returns identical frequencies.

Regenerate after changing any SDK example, using a local Python environment
with FlagQuantum and PyTorch installed. From `apps/web`:

```sh
node scripts/export-gate-examples.mjs > /tmp/flagqai-gate-examples.json
python scripts/precompute-gate-examples.py --input /tmp/flagqai-gate-examples.json --output src/data/gate-example-results.json
pnpm test
```

The Python generator executes only the trusted built-in examples exported by
the first command. It is a development tool and is never exposed as a web API.

### Agent protocol verification

`node scripts/agent-protocol-fixture.mjs` (from `apps/web`) starts an explicitly
labelled **Scripted protocol test** backend on 4097 and an isolated workspace on
4190. It uses the real server and shared native transcript projector, with no LLM
calls. Send `permission`, `question` or `cancel` to inspect those flows. This is a
development fixture, never a production fallback or an Agent response generator.
The script requires an existing CLI build for the shared projector; stop it after
testing. Production always uses the configured native backend.

### Live Agent edits in the Model editor

Choose **Share with Agent** in Model to create a new dedicated OpenQASM file under
`.flagqai/quantum-workspace/models/`. This explicit action initializes a fresh file
from the current editor; it never overwrites an existing file. The linked relative
path accompanies model context on subsequent Agent messages when the attachment is
selected. Ask the Agent to edit that file using its native tools. This initial
integration supports these OpenQASM exchange files, not arbitrary Python or repo
files. No extra Agent tool or execution loop is introduced.

The editor checks the linked file approximately every 600 ms, including while the
Agent dock is closed. A clean editor updates automatically, briefly marks changed
lines, and retains Undo. A local draft that differs from the last synchronized
file stays intact. **Review changes** compares the draft with the incoming file;
keep the draft, explicitly use the file, or edit and apply a merged version. Both
the draft and incoming revision are checked before applying, so stale reviews
cannot overwrite newer typing. Refresh preserves the binding, draft and pending
conflict. Switching models disconnects the old binding; late responses are ignored.

**Save** still saves to the browser model library. Neither Save nor a review choice
writes back to the linked disk file. **Copy path** identifies it; **Disconnect file**
leaves both the editor and disk file intact. Compiled programs remain immutable
snapshots and require explicit compilation after edits. Removed, oversized, binary
or temporarily unreadable files show an error and preserve the editor contents.

The same-origin backend exposes only create/read for generated `.qasm` identifiers
inside the exchange directory, rejects symlink directories/files, traversal and
non-regular files, and enforces the 32 KiB bound. It exposes no arbitrary path read
or existing-file write endpoint. Native Harness tools keep their existing approvals.

### Transcript formatting

Web replies use the same `marked` Markdown tokenizer as the CLI, with a React
renderer for headings, emphasis, inline code, nested/ordered/task lists, quotes,
tables and fenced code. Unfinished streamed fences remain code blocks; Python and
OpenQASM use the existing syntax colors and Copy control. Other language blocks
remain readable plain code. Message parsing is memoized by text. Tool arguments
and outputs retain their separate native cards. Each assistant message has a persistent small Copy Markdown icon at the original
lower-left end of that answer, within the existing message gap. It adds no footer
row and scrolls naturally with the answer. It copies the native text verbatim, retaining LaTeX delimiters,
code fences, tables and whitespace; tool and reasoning cards are not appended.
During streaming it copies the current text snapshot. Question cards expose a copy
icon on hover or keyboard focus, with a reserved gutter to avoid covering text.
Question copy uses the original user text, excluding the generated workspace
attachment envelope.

Raw HTML is displayed as text, images are not fetched, and executable link
protocols are refused. The renderer mounts React elements rather than model HTML.
LaTeX uses local KaTeX and bundled fonts: `$...$`, `\(...\)`, display
`$$...$$`, `\[...\]`, aligned environments and math fences also work in
tables and lists. Hover a complete formula to reveal a small copy button outside its mathematical
ink. The button copies original LaTeX without surrounding math delimiters and is
keyboard-focusable. Clicking or selecting the formula itself does not copy.
Positioning avoids other formulas and surrounding prose without adding layout
space; incomplete streamed formulas are not copy actions.
Code remains literal. Unfinished or unsupported formulas preserve
their source. TeX cannot enable HTML, links or images; expansion and size are bounded.
Terminal-specific ANSI and Mermaid rendering are not introduced.

### Compact Agent toolbar and context usage

Connection status, backend, new chat, history and settings share one toolbar.
The status dot reconnects on click; offline states expose Connect text. The
source attachment is staged as removable snapshot chips inside the composer. Composer metadata shows `ctx` from the native shared projection's
occupancy and context window, with token counts on hover. Sample-based readings
carry `~`; missing readings stay unknown. No cumulative billing counters or
browser token estimates are substituted. Compaction and high occupancy are shown.
Compact invokes the SDK's native compact endpoint for capable, idle sessions,
with pending decisions and concurrent actions protected. Its status and resulting
occupancy come from the native stream; drafts and editor code are untouched.
Auto shows the native on/off state and threshold. Its dialog reads back the
session's native policy and saves a 50–95% threshold, with idle/pending guards.
Overrides persist under `.flagqai/compaction-policies/<session-id>.json` and restore
on resume. They do not alter other sessions. The native Basic engine's pinned
patch in `apps/cli/patches` is required for live settings; older hosts report
unsupported instead of accepting cosmetic settings.
The Web starts no automatic compaction loop. DSH's mounted compaction service owns
its configured automatic policy (the current native default enables automatic
pressure checks before steps, with a 0.8 threshold ratio subject to output reserves
and headroom). Manual summarization can consume model tokens.

### Transcript navigation

Once a question has scrolled out of view, a compact pinned preview links back to
that question. The preview follows the turn currently being read, including older
turns. Scrolling away from the bottom reveals Latest output; selecting it returns
to the bottom and resumes following streamed output. Manual reading is not
interrupted by arriving messages. Navigation remains inside the Agent dock.

### CLI-style thinking and tool activity

Native reasoning rows use a muted compact header, an active three-line preview,
and a collapsed completed state. Expand to read the backend-provided reasoning.
Tool rows share the CLI status gutter and color families, with path/command titles,
three-line completed summaries and five-line live tails. Expand for parameters and
raw results; native read/search/diff/terminal presentations take precedence over
raw text. Diff additions/deletions and failures have distinct colors. Native
recorded durations and reasoning-token counts appear when supplied; missing
telemetry is not invented. Terminal control sequences are removed from display.
These changes consume the existing session.view projection and do not reconstruct
Agent history or change approvals.

### Models and Provider configuration

Open the gear beside the backend selector, click the current model name, or enter
`/model` / `/provider` in the composer. These local UI commands open settings and
are never sent as model prompts. The SDK reuses native session model catalogs,
model switching, Provider status, discovery and configuration APIs. Model changes
adopt the replacement session returned by Harness, including its native history
inheritance; the Web does not fork or copy conversation history itself. Running
turns and pending permissions/questions block a switch.

Built-in and custom providers support base URL, protocol, API key, discovery and
manual model IDs. Saving edits the same native configuration as CLI `/provider`
and sets the first selected model as the default for new sessions. Switching an
existing chat remains explicit in the Models tab. Blank keys are omitted to keep
existing credentials. Keys are held only in the open form, sent to the loopback
Harness, cleared on successful save/close, and never persisted by the browser.
Discovery contacts the selected provider through the native service; it does not
start a model completion. Service availability and errors are displayed directly.
The proxy exposes only the specific Provider and session model routes, retaining
Host/Origin guards and per-session workspace validation.

The composer defaults to two lines, with an inset send/stop control. It grows
with content up to a viewport-aware cap and then scrolls internally. Copy draft
remains available under Connection; draft storage and keyboard/IME behavior are
unchanged.

### Slash command picker

Typing `/` at the beginning of a single-line composer opens a command list above
it. Filter by command, alias, or English/Chinese keywords; use Up/Down, Enter to
open, Tab to complete, click to choose, and Escape to dismiss while keeping the
input and Agent dock. IME confirmation is not intercepted. Only implemented Web
commands are listed (`/new`, `/resume`, `/model`, alias `/models`, and `/provider`); an unmatched
slash command is not submitted as a paid model prompt. Paths, prose containing a
slash and multiline input retain ordinary message behavior.

`/new` opens a fresh native session using the selected backend without deleting
the previous session or changing the Model editor. The command clears only after
creation succeeds; errors retain its input. `/resume` opens a searchable native
history picker, also available from History. The picker refreshes on open, scopes
results to the workspace, sorts by recent activity and shows title, backend, model,
branch and native session ID. Current/occupied entries are marked and disabled;
switching is blocked during a turn, delivery or pending interaction. Historical
transcripts are restored through the existing native event projection, never
copied into a Web conversation database. Ordinary composer drafts survive clicking
the History/New chat controls; local slash commands are consumed as commands.

### Rename and Web Trash

History rows offer inline Rename with a bounded, non-empty title. The SDK calls
`POST /v1/catalog/{backendId}/{sessionId}/rename`, which uses the backend's offline
catalog capability without launching an Agent. An already open idle session uses
its native live rename capability. The native server rejects occupied/running
sessions; the workspace proxy checks the catalog entry belongs to its fixed cwd.
CLI and Web read the same persisted native title.

Delete opens a confirmation and moves the reference to **Web Trash**. This is a
workspace-scoped visibility preference, not permanent deletion or a native archive:
CLI history and original transcripts remain intact. The Trash tab restores entries.
Only backend/session IDs are stored in `.flagqai/quantum-workspace/history-trash.json`;
no transcript copy or secondary Agent history database is created. Writes use
no-follow directory/file access and atomic replacement. Search and Rename work in
Trash; restore an entry before resuming it. Current conversations cannot be deleted,
and running/occupied sessions are protected. A deletion confirmation names the
conversation and explains preservation before the write.

### Task progress and child agents

The Agent transcript displays native Todo snapshots and child-agent lifecycle
updates per user turn. Expand **Tasks** to inspect pending, active and completed
steps. Child cards show the reported status, model, duration and summary; opening
a card loads the native read-only transcript, with refresh and earlier-history
controls when supported. Unsupported history reports an explicit error rather
than inventing child output. The native child catalog supplies a periodically
refreshed fallback for children absent from the transcript projection.

Completed progress is stored inside that turn's **Worked for** disclosure.
Running background children remain visible until their native status settles,
and final answers and permission prompts remain outside the fold. Statuses do
not become completed merely because the parent turn ends. Native event replay
restores per-turn progress; an unchanged previous Todo list is not copied into a
new task. The localhost proxy exposes only read-only child catalog/history routes
and retains the same workspace and Origin guards as the rest of the Agent API.

Set `FQ_TEST_PROGRESS=1` when launching the scripted protocol fixture to exercise
Todo updates, child status, transcript loading and completion folding without
starting real subagents or calling a model.

Running child agents are shown below the composer as a small status dot: gray
when none are running, blue with the number of starting/running children when
active. Click the indicator to inspect child details in a bounded panel above
the input; clicking outside or pressing Escape closes it. Live child cards do
not repeat inside the transcript. Settled turn details remain in **Worked for**.
The transcript and indicator share one native catalog subscription.


### Composer code references

Type `@` or click the small `@` button to search the current model/program,
saved models and compiled programs. Use arrows and Enter/Tab to select; Escape
dismisses the menu. Selected references become removable preview chips. Each
chip holds a bounded snapshot from the time it was attached, so later editor
changes do not silently change the pending attachment. Up to four snapshots can
be staged and persisted alongside the local prompt draft.

Select text in the Model editor and choose **Send selection to Agent** from the
editor header or selection context menu. This opens the Agent and stages only
the selected lines, with line numbers. It never sends a prompt or changes code.
Existing prompt text and other staged snapshots remain intact.

Successful sends consume the submitted snapshots and preserve any newly staged
ones. Failed sends retain the prompt and attachments. Sent source is collapsed
under its question, including each snapshot in multi-attachment messages. The
JSON envelope escapes `@` as a Unicode escape without changing the decoded
source; this prevents OpenQASM annotations such as `@register` and `@module`
from being interpreted as native CLI filesystem mentions. No backend attachment
parser or second Agent execution loop is introduced.

### Agent ↔ workbench action bridge

When a native session is connected, the Web publishes a bounded current-workbench
snapshot to its existing localhost host. Agent messages carry lightweight controls
(the command prefix, selected model, dirty state and actual compute transport),
not an automatic copy of the entire source. The native Harness can use its normal
shell tool to invoke `packages/quantum-workspace/platform.py`. This adapter calls
the same application service used by the Compile and Run buttons; it introduces
no Agent scheduler, model client, arbitrary-code endpoint or alternate session log.

The command prefix includes a per-tab client ID, durable native session ID and
localhost port. Supported operations are `status`, `draft.read`, `model.read`,
`model.share`, `model.create`, `compile`, `run`, `job.read` and `focus`. Mutations
require a request ID; repeat the same ID and arguments for delivery retries.
Read `status`, share with its `source_hash`, then read the shared model to obtain
its exact revision before compiling. Execute the returned compiled program ID,
then read the returned job ID until the actual backend settles. A failed operation
is never replaced with a handcrafted simulation or a successful-looking result.
Database connections close after each operation, including background polling.
After a host restart, interrupted deliveries become explicit unresolved-outcome
errors; they are never automatically replayed. Inspect existing programs and jobs
before issuing a new mutation when an outcome is unknown.

Browser context expires after 60 seconds without a heartbeat. Commands reject
expired clients and changed native sessions. File reads use only bounded shared
OpenQASM model IDs; compilation checks the requested revision. Program resources
are immutable snapshots and jobs execute that exact source. Loopback Host/Origin
checks apply to the bridge as to the existing local API. The command adapter does
not bypass the native shell tool's permissions.

Artifacts appear beneath their originating question with **Open circuit** and
**View results** actions. Program imports and job polling do not replace the Model
draft or navigate away. **Follow Agent** is off by default. When enabled, it follows
new Agent navigation events; opening a newly created model retains the previous
draft as a recoverable model. Existing shared-file synchronization still routes
concurrent user edits into the review UI. A reconnect does not replay previously
seen navigation actions. UI button actions are not attributed to the Agent.

The execution transport remains explicit. The existing default is SSH CPU. To use
a real local CPU environment, launch the host with `FQ_COMPUTE_TRANSPORT=local`
and optionally `FQ_LOCAL_PYTHON=/absolute/path/to/python` containing FlagQuantum
and PyTorch. Missing dependencies fail explicitly; there is no silent SSH fallback.
This optional Python compute environment remains outside the CLI npm package.

For deterministic acceptance, launch the existing protocol fixture with
`FQ_TEST_BRIDGE=1`. It uses a separately labeled scripted compute host and invokes
the real command adapter for status, model sharing, revision reads, compilation,
execution and result queries. It never calls an LLM or a quantum provider.

### Python models and execution

Model now has OpenQASM and Python tabs. Each language retains its own unsaved
source, shared file and undo stack. Upload/download and saved models preserve
`.py` versus `.qasm`; Python attachments are explicitly labeled for the Agent.
The existing shared-file compare/review flow applies to Python too.

**Run Python** submits an immutable single-file snapshot to `/api/python/runs`.
The selected compute transport is used: SSH runs the configured remote `python3`;
local mode uses `FQ_LOCAL_PYTHON` or the host interpreter. No dependencies are
installed automatically. Each run has a temporary working directory, unbuffered
stdout/stderr, a 90-second execution deadline and a Stop action. Logs are capped
at 64 KiB and retained with the source, exit code and runtime metadata in the
adjacent `.python.sqlite3` database. The output pane is resizable, includes run
history, and links tracebacks to the matching source revision. Host AST checks
are advisory; syntax and dependencies are validated by the selected interpreter.

Python execution has that interpreter's normal account permissions. A temporary
directory and separate process group are not a security sandbox. Keep this host
bound to loopback for this personal, local deployment. The fixed supervisor stops
the child process group on cancellation, channel closure, timeout or normal exit.
Service shutdown cancels queued/active Python work. Notebook kernels, persistent
variables, multi-file projects and package installation are not introduced here.

Python examples use the SDK's official save interface:

```python
import flagquantum as fq

circuit = fq.Circuit(2)
circuit.h(0).cx(0, 1)
result = fq.run(circuit)
fq.save("bell.fqx", result.plan, result=result)
```

The workbench collects saved `.fqx` files after execution. Known legacy Bell
examples are migrated on workspace restore, preserving circuit edits and a full
pre-migration recovery copy under `fq-before-save-load-migration-v1` in browser
storage. Unknown uses of the legacy helper are left unchanged.

Native workbench tools support `model.create --language python`,
`python.run --model-id ID --revision HASH`, `python.read --run-id ID`, and
`python.cancel --run-id ID`. Mutation request IDs retain the existing retry and
unknown-outcome rules. The Agent continues to use native Harness shell permissions.

### Reviewing Agent edits and source versions

Shared-file changes still stream into a clean editor. The first unreviewed source
is retained as the batch baseline while subsequent updates arrive. Changed lines
receive gutter markers; **Review changes** opens a syntax-highlighted unified Diff
with old/new line numbers, additions, deletions and folded context. Large rewrites
use bounded comparison work and progressively rendered rows.

For a clean synchronized batch, **Accept changes** records the review without
changing the source. **Keep my version** restores the pre-Agent source if no newer
user edits exist; otherwise it retains the current draft. **Undo Agent change**
restores the saved baseline only when the editor still contains the exact applied
version. Compiler errors for unchanged source are preserved. These decisions only
change the browser draft; they never write over the native Agent's shared file.

Conflicting browser drafts remain protected. Review offers **Keep my draft**,
**Accept Agent changes**, and an optional merged-code editor. Decisions compare
both the draft contents and incoming revision. If either changes during review,
refreshing the comparison is required. The proposal, applied version and baseline
are retained with the editor link across reloads. This is the latest batch review,
not an unbounded edit-history system.

Editor, circuit and result views identify exact UTF-8 source revisions using
SHA-256 (eight characters displayed, full digest in the tooltip). Artifacts mark
whether their source matches the current editor. New Python artifacts retain both
the original Python source and generated OpenQASM; their versions refer to the
original script. Older artifacts without this provenance identify the available
OpenQASM snapshot only. Opening a source snapshot preserves a different unsaved
draft as a recoverable model in the model library.

### Import a saved FlagQuantum experiment

Model's **Import model or experiment** and Quantum's **Upload Quantum Program**
accept `.fqx` files. These are the official FlagQuantum Experiment archives from
`fq.save` / `fq.load` (SDK PR #960), not Python scripts or JSON renamed to `.fqx`.

```python
import flagquantum as fq

program = fq.compile(fq.Circuit(2).h(0).cx(0, 1))
result = fq.run(program, outputs=fq.counts(),
                options=fq.ExecutionOptions(device="cpu", backend="pytorch", shots=128, seed=42))
fq.save("bell.fqx", program, result=result)
```

Importing calls the installed SDK's `fq.load` in a fixed local reader subprocess;
it never calls `fq.compile`, `fq.run`, a sampling function or the SSH compute
adapter. The subprocess uses `FQ_EXPERIMENT_PYTHON`, falling back to
`FQ_LOCAL_PYTHON` then the server interpreter. It must have the merged save/load
SDK and PyTorch available. An old SDK produces an actionable import error; there
is no custom replacement decoder or silent compute fallback.

The initial Web reader supports files up to 16 MiB, 1–16 qubits, 2000 gates,
32 KiB of exported OpenQASM, 128 measurement outputs and a 2 MiB preview. It
preserves saved measurements and their batches/qubit order. Numeric previews
retain dtype/shape and show at most 1024 elements; complex values are
`[real, imaginary]` pairs. Downloading the original `.fqx` preserves every byte.
A circuit without a result is explicitly labeled **Circuit only** and creates
no measurement job. Imported results are labeled **Archived result** and retain
recorded settings, SDK version and provenance. They do not acquire a made-up
execution time or use the currently configured backend as their source.

Imports persist next to the existing database in `experiments/` and
`*.experiments.sqlite3`. `GET /api/experiments` restores their snapshots after a
refresh; their saved jobs join the existing local result history. Import opens
the Quantum snapshot without replacing source, undo history, shared-file links
or either language's draft. **Open source in Model** is an explicit separate
action using the existing draft-backup flow. The source shown there is an
OpenQASM export; `.fqx` does not contain the original Python script.

Manual uploads and automatic Python-run collection share this reader. The
existing `flagquantum_web.publish` helper remains available for older scripts.

### Automatically collect Python experiment files

**Run Python** collects the `.fqx` files saved by that task, including nested
relative paths. The supervisor uses a fresh temporary directory per run and
collects only regular files inside it, without following symbolic links. It
transfers at most 8 files, 16 MiB per file and 32 MiB combined in checked chunks.
Each file is independently validated through the same SDK `fq.load` reader as
manual import. No computation or sampling is repeated during collection.

```python
result = fq.run(circuit, outputs=fq.counts(),
                options=fq.ExecutionOptions(shots=1024, seed=42))
fq.save("bell.fqx", result.plan, result=result)
```

The Python output pane lists the files with **View circuit** and **View result**
actions (or **Circuit only** when no result was saved). These actions preserve
the editor draft. Each record links to the immutable Python source, run ID and
SHA-256 captured at submission; reusing `bell.fqx` in another run creates a
separate record. Large arrays stay in the experiment store rather than browser
draft storage. Results and downloads remain available after refresh and restart.

Execution and collection have separate states. A Python exit code of zero can
have collection errors; one corrupt file does not discard valid siblings. Complete
files that fail preview validation remain downloadable from their collection
error, rather than being lost with the temporary task directory. A
failed script may leave valid completed files, which are retained with the
failed Python execution status clearly recorded. Cancelled/timed-out scripts do
not collect potentially incomplete files. The run remains active while final
collection is in progress, so clients cannot stop polling before results appear.

`python.read` returns `experiments` references, `source_hash`, `execution_status`,
`collection_status` and `collection_errors`. The existing authorized workbench
command adapter accepts `experiment.read --experiment-id ID` to inspect a
reference; `job.read` also resolves its saved result. Native Harness retains
Agent/session/tool authority.

`FQ_REMOTE_PYTHON` (or local `settings.json` key `remote_python`) selects a separate
SSH Python task interpreter. The OpenQASM compute adapter remains unchanged.
The task interpreter must have a FlagQuantum release with `save/load` support;
its actual SDK version and support are reported by each task after importing the
SDK. Existing saved drafts are not rewritten; **Load save/load example** creates
the updated built-in example through the existing draft-preserving Model action.
Legacy scripts using the injected `flagquantum_web.publish` still work, but new
examples use only the official SDK API.
