# Web product acceptance

This is the acceptance contract for the local FlagQuantum workbench, not a
production-readiness certificate. The Web product decision and native Harness
ownership remain as defined in QUANTUM_WORKSPACE_WEB.md. No additional Agent
loop, provider credential store or simulation engine is introduced.

## Three required journeys

The machine-readable case list is `apps/web/acceptance/product-contract.json`.
Every browser case must belong to exactly one journey. Removing, renaming or
skipping a case requires an explicit contract update, not a silent green build.

| Journey | User outcome | Required evidence |
| --- | --- | --- |
| First successful experiment | Start from Python, change an example, run it, understand circuit and measurements | Real CPU SDK Bell/GHZ/X/arithmetic examples; `.fqx` circuit/result provenance; explicit error versus missing output; searchable Jobs, intentional comparison and all-state pagination |
| Agent collaboration | Inspect native tools, review edits, run and compare without losing control | Scripted native protocol tools and reconnect; file review and undo; failed-run repair; Follow On/Off; two actual SDK results and circuit/distribution differences |
| Research continuity | Leave, recover and continue the same work | Refresh with selected history and drafts; lost-receipt recovery without duplicate execution; archive collection outage versus corruption; project view restoration; uncertain native decisions; visible browser-backup failure and retry |

The scripted Agent uses the actual server protocol and real SDK execution. It
proves client/runtime integration, not an LLM's reasoning quality. No paid model
request is made by these checks. Counts alone do not prove phase or fidelity.

## Automated gate

CI runs typechecking and Web regressions, builds the client, requires the pinned
real SDK suite with zero skipped tests, and executes the browser journeys. The
JSON browser reporter and SDK report record the same CI revision. The final
`Verify complete product journeys` step runs even after a preceding failure.

It rejects missing tests, duplicate required titles, runner errors, skipped or
retried tests, stale revision evidence, incomplete SDK evidence and incorrect
SDK/runtime versions. Unexpected extra browser failures also fail the gate.
A completely empty run cannot pass.

The generated `apps/web/sdk-results/product-acceptance.json` contains per-case
and per-journey outcomes, raw evidence hashes and outstanding product gates.
CI uploads it alongside browser traces/screenshots and the real SDK report.
A passing automated report still says `product_readiness: incomplete` and
`release_authorized: false` while the product gates below remain unverified.

### Reproduce the automated lane

Use the pinned SDK checkout, CPU dependencies and PYTHONPATH from the Web CI job;
the exact SDK source revision is in `.github/workflows/ci.yml`. Do not substitute
static example outputs or a different local SDK and call it the same evidence.
After the existing dependency/browser installation steps:

```sh
pnpm web:check
pnpm web:build
python packages/quantum-workspace/tests/sdk_acceptance.py --report apps/web/sdk-results/acceptance.json
pnpm cli:build
pnpm --dir apps/web test:e2e
pnpm web:verify:journeys
```

Run the final verifier even when a preceding command failed. It assesses existing
evidence; it does not run the tests itself. Local reports use the explicit label
`local-working-tree`, while CI uses GITHUB_SHA. Local evidence is not a release
attestation. The browser harness uses isolated workspaces and scripted services;
never use a user's live conversation, experiments or provider configuration.

## Reliability boundary delivered here

Workspace persistence now returns whether the authoritative snapshot was saved.
A failed write leaves the previous complete snapshot intact and keeps current
edits in memory. The UI exposes Retry and a downloadable JSON snapshot containing
current code and other draft buffers. It requests a browser leave confirmation
while the backup is unavailable. A successful retry removes the warning.

Optional legacy mirror failures cannot misreport an already-durable canonical
snapshot as lost. Transient UI changes with an identical snapshot perform no
storage writes, reducing synchronous work during navigation and background
updates. None of this turns browser storage into a server backup.

The download permits manual recovery. A safe import/merge interface for this JSON
is not implemented; do not claim complete workspace backup round trips yet.
Corrupt stored payload recovery and all-browser storage denial need separate
failure-injection acceptance before stronger recovery claims are made.

## Product gates still requiring evidence

- **Independent use:** two people other than the implementer complete all three
  journeys without developer intervention. Record the task, build, machine,
  completion, interventions, errors and elapsed time. Do not invent trials.
- **Efficiency:** record p50/p95 for editor input, Jobs switching, circuit
  inspection and reconnect on a named reference machine and dataset. Set budgets
  from that baseline and user needs before enforcing them; do not equate a
  scripted model's speed with live-model latency.
- **Scale and accessibility:** exercise long transcripts, large circuits, many
  historical results, keyboard-only operation and narrow viewports. Record the
  tested sizes and memory/render limits rather than implying unlimited scale.
- **Actual model capability:** separately authorize and evaluate live-model task
  correctness, tool choice, recovery and cost. Protocol fixtures cannot certify it.
- **Workspace backup import:** verify draft-safe import, corrupt input handling and
  round trips before offering one-click workspace restoration.

These are the next acceptance work items. They are deliberately visible in the
report so that feature growth cannot quietly redefine what “finished” means.

## Interaction craft acceptance

The interaction-craft browser case introduces real network delays around submit,
stop and history loading, with a bounded Python process and no model request.
It verifies that pending actions get immediate feedback and that a stop request is
not described as stopped before a terminal run is observed. Selecting history
keeps the requested selection and shows explicit loading rather than flashing
Ready or attributing the previous run's output to the new selection.

Console output is keyboard-focusable, has an explicit latest-output control and
does not announce the entire log repeatedly to screen readers. Only the compact
run status is live. Run controls and console header columns reserve stable space.
The existing reduced-motion preference continues to disable decorative motion.

Jobs preserves chart/table, units, ordering, page and measurement selection within
the browser tab, including reload and returning from another page. Preferences
are scoped by result, bounded to 64 results and clamped to the actual data. They
are optional session preferences, separate from durable drafts and SDK artifacts.
The Export control closes on outside press, focus leaving or Escape; Escape and
completed export restore trigger focus. Code review names the user's draft versus
the Agent proposal, and distinguishes pending proposals from already-synced edits.

This is targeted interaction acceptance, not a claim that full accessibility or
large-scale performance has been established. Those gates remain pending above.
