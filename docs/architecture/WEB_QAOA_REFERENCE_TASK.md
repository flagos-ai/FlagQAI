# QAOA Max-Cut reference workflow

This is the first bounded research workflow for the workbench. The shared task
specification, natural-language request and runnable reference implementation are
in `apps/web/src/tasks/qaoa-maxcut.mjs`. It uses existing native Harness tools and
ordinary FlagQuantum SDK APIs; no additional Agent loop or Python bridge package
is introduced.

## Research question and acceptance

Can one layer of QAOA improve Max-Cut outcomes over uniform superposition on the
six-node triangular-prism graph? Its two triangles make cutting every edge
impossible. Enumerating all 64 bitstrings independently establishes optimum 7
on 9 edges, attained by 6 bitstrings. This is a small ideal CPU simulation and
makes no quantum-advantage claim.

The reference evaluates 81 deterministic parameter pairs using exact SDK
probabilities. Final baseline and optimized experiments request both counts and
probabilities with 4096 shots, seed 42, CPU/PyTorch and fallback disabled. The
search has no shot count because probability-only outputs do not accept shots.
The cost layer implements exp(-i gamma C) using CX/RZ(-gamma)/CX and the mixer
uses RX(2 beta). All objective and hit-rate calculations use the same q0-first
bitstring convention and explicit graph definition.

The script checks its uniform expected cut, optimized objective and optimal-cut
probability improvement, sample totals, archive round trip, and a newly executed
archive replay. Assertions fail the run rather than printing success. Loading
alone does not constitute replay: `fq.load` reads the saved evidence, followed by
`fq.run(archive.program, options=OPTIONS)`. The archived program already includes
measurement requests, so replay must not add `outputs` again.

Output files:

- `01-maxcut-baseline.fqx`: uniform-superposition executed plan and measurements.
- `02-maxcut-qaoa.fqx`: grid-selected QAOA executed plan and measurements.
- `03-maxcut-replay.fqx`: newly executed optimized archive, checked against its
  recorded counts and probabilities.

The `MAXCUT_REPORT=` JSON line in retained run output records graph, classical
optimum, parameters, grid size, seed/shots, exact and sampled metrics, and replay
outcome. Source snapshots and runtime provenance remain in the existing run and
archive records. Files are created in each run's fresh task directory; standalone
users should run in a fresh directory rather than overwrite earlier evidence.

A local run with the pinned FlagQuantum 0.4.0 CPU SDK produced expected cut
4.499998 -> 5.871086 and exact optimum probability 0.093750 -> 0.411669.
Sampled mean cuts were 4.506348 -> 5.864746; sampled optimum rates were
0.094727 -> 0.413330. Selected gamma was 0.698132 and beta was 0.349066 radians.
These are observed reference values, not hardcoded simulation results. Seeded
count equality is verified for the tested SDK/runtime; changing versions or
backends may change sampling and should be separately evaluated.

## Web experience

1. Open Agent in an empty chat and choose **Optimize Max-Cut**. It fills a
   reviewable request; it does not send or execute automatically. The existing
   native model/provider configuration is used after the user sends it.
2. The request asks for a separate model, preservation of drafts, actual SDK
   computation and failure visibility. Follow Agent remains the user's choice.
3. The Agent can show the optimized circuit, use the standard comparison tools,
   and report objective/hit-rate metrics with their limitations. Exact original
   archives and immutable source/run evidence remain accessible from results.
4. In Jobs comparison, choose baseline/optimized to inspect the change. Choose
   optimized/replay to inspect identical recorded distributions. Both operands
   remain explicit and comparison selection survives reload.
5. For a direct SDK/reference path, close Agent, open Models and select
   **QAOA Max-Cut · 6 nodes** under Research workflow. Run Python executes the
   reference in a fresh task directory and collects all three archives. Selecting
   the reference preserves the previous draft in My models.

The basic Bell/GHZ/arithmetic examples and existing template generator remain
unchanged. This one reference workflow does not introduce a general library.

## Evidence boundary

The required browser case is **QAOA Max-Cut reference: scripted Agent
orchestration, real optimization, comparison and reproducible archives**.
It uses the actual native workbench tools and SDK, checks source/artifact binding,
optimization metrics, baseline/optimized comparison, archive replay comparison,
refresh, original download, an independent fresh source rerun and draft recovery.
The test-only protocol fixture is explicitly labeled scripted and guarded by the
isolated acceptance environment. It supplies no model intelligence and never runs
as the production Agent backend. Numerical results are computed by the real SDK.

The automated protocol/browser lane makes no paid model calls. Real-model quality
and monetary accounting remain separate product gates: execute the request with an explicitly authorized
provider/model and budget, record interventions and cost, inspect its generated
code, and apply the same scientific and reproducibility checks. A protocol pass
must not be presented as a real model having independently solved the task.


## Authorized real-model run

A separate user-authorized run on 2026-11-02 used the currently configured
`baai / deepseek-v4.1-flash` model, with the user's CNY 10 ceiling and previously
confirmed gateway hard cap. The Agent authored code independently, recovered from
two failed compute attempts, and completed the workflow without evaluator code
corrections. See [the real-model acceptance report](../acceptance/QAOA_REAL_MODEL_2026-11-02.md)
for artifacts, independent reproduction, UI findings and the unverified monetary
billing limitation. This one functional pass does not certify general Agent
quality or close the full product-readiness gates.

## Saved outcome card

The completed Agent experiment card reads the successful run's three named QAOA
archives. It computes expected cut and sampled optimal-cut rates from saved
probabilities/counts and the literal EDGES graph in that run's source. It never
uses the Agent's prose or a printed success flag as numerical evidence. Dynamic
Python graph expressions and unsupported measurement layouts produce an explicit
unavailable summary, with retry and the existing comparison/run-history paths.

Before displaying metrics, the client hashes the saved Python source and checks
run ID, source hash and exact source against each archive's origin. Archive ID,
filename and SHA-256 must also match the collected run manifest. This checks the
local service's provenance records; it is not a new independent archive-byte
integrity audit or a proof of an optimal parameter search.

Seeded replay requires equal program hashes, recorded compiler/environment/options
fingerprints, seed, shots and exact counts, plus maximum saved-probability error
below 1e-6. Missing facts never become a passing replay badge. The evidence fold
retains full source/archive hashes, run ID, compute time, SDK and replay tolerance.
All three archives remain downloadable. Actual device/backend come from the saved
execution plan/runtime, independently of current execution settings.

View code opens a read-only syntax-highlighted snapshot with the shared modal
close control. View circuit imports/selects that saved program without changing
source, links, language drafts or undo history. Compare results and Check replay
select the exact archive IDs. Earlier failed attempts remain in the recovered
run-history fold and Worked for. No action here starts Python or an Agent turn.

## Parameter iteration and version comparison

Iterate parameters opens a compact form for requested QAOA layers (1–8), shots
(1–1,000,000) and a uint32 seed. Shots/seed default to the selected optimized
archive. Prepare iteration only appends an inspectable request to the Agent
composer; it neither submits a native turn nor runs Python. Existing chat text is
retained. If the combined draft would exceed the existing 6,000-character limit,
the entire append is refused without truncation or replacement.

The request pins the parent run ID, source SHA-256, optimized archive ID and its
SHA-256. It asks the native Agent to inspect the saved run/archive, create a
separate Python model and copy a versioned FLAGQAI_QAOA_ITERATION JSON comment
into its source. This is lineage metadata and user intent, not an additional
Agent loop or proof that the requested algorithm was implemented correctly.

When that source is run, the client reconstructs lineage from the immutable
source snapshot and reads the parent from the existing Python API. Both parent
and successful iteration must pass the archive/source checks used by the outcome
card. Different graphs or mismatched parent identities prevent version metrics.
Run/collection failures do not remove the parent result. While the native Agent
is still active, a failed attempt is described as an attempt, not a final task
failure. The normal Worked for and earlier-run history remain authoritative.

The comparison shows actual expected cut, sampled optimal-cut rate, compiled
depth, compiled instruction count and total Python compute time. Equal or lower
expectation is reported honestly. Time includes parameter search and replay; it
is not a circuit-only performance benchmark. Requested p remains explicitly
labelled as intent. Sampling or SDK/backend changes produce visible caveats.
Compare versions uses the previous optimized archive and the new optimized
archive, independently of the within-run uniform-superposition comparison.
References survive reload through native run history; no temporary browser-only
result is treated as a completed iteration.

The isolated protocol acceptance performs a real CPU/PyTorch SDK p=2 run with
shared angles per layer on the same 9-by-9 grid. This is a bounded two-angle
search, not a global search over four independent angles. It includes a deliberate
failed attempt, baseline retention, draft preservation, separate source/run and
archive identities, increased compiled depth, exact comparison selection and
reload/history checks. It never contacts a model provider.

Generated iteration questions use a compact conversation summary while their full
request and lineage metadata remain in a collapsed Iteration details disclosure.
Any preceding user-authored draft text stays visible. The native message and the
question copy action retain the complete original Markdown; the pinned question
preview uses the same compact summary. Invalid metadata falls back to the normal
message view rather than being silently discarded.
