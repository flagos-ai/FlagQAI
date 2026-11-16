# Five domain researcher workflow review

Status: internal technical walkthrough executed on 2026-11-05. See
[observed findings](FINDINGS_2026-11-05.md) and the five linked records. Four
scientific checks passed, all four workflows remain partial, and chemistry was
environment-blocked. No paid model was called or product feature added.

This packet defines an internally operated expert
walkthrough for quantum information, quantum computing, quantum error correction,
quantum dynamics and quantum chemistry. It does not depend on recruiting people
or asking the product owner to organize sessions. No participant observations,
interview quotes, willingness-to-pay findings or retention results exist yet.

The decision is which research workflow deserves a subsequent product trial.
The working hypothesis is that the workbench helps connect a research question,
saved code, executed results, comparisons and reproducible evidence. Attractive
screens or successful tool calls alone do not establish that hypothesis.

The per-task records reference the original local evidence packet by relative
path. Its raw outputs, screenshots and research archives are not distributed
with this documentation.

## Packet

- [Task cards and domain acceptance](TASK_CARDS.md)
- [Reviewer procedure and discussion prompts](REVIEW_GUIDE.md)
- [Experience record template](REVIEW_RECORD_TEMPLATE.md)
- [Machine-readable review register](review-register.json)

## Five perspectives

These are assumed skill profiles for task design, not descriptions of recruited
participants. One scenario per domain cannot represent that domain's population.

| ID | Perspective and assumed working knowledge | Research outcome to inspect |
| --- | --- | --- |
| QI-01 | Quantum information researcher; density operators, partial trace, Python linear algebra | Distinguish entanglement from a classical mixture despite identical measurement counts |
| QC-01 | Quantum algorithm developer; parameterized circuits and objective functions | Compare two QAOA parameter searches with a verified classical reference |
| QEC-01 | Error-correction researcher; noise assumptions and statistical estimates | Compare an unencoded bit and a repetition code under one explicit error model |
| QD-01 | Dynamics researcher; Hamiltonians, observables and numerical approximation | Compare exact evolution and two Trotter step sizes on a shared time grid |
| QCH-01 | Chemistry researcher; molecular inputs, basis sets and electronic energies | Compare two variational calculations against a consistent small-molecule reference |

## Operating constraints

The reviewer prepares inputs, checks local environments, runs the two lanes,
records evidence and writes findings. The product owner has no recruitment,
installation, scheduling or form-filling assignment in this round.

Use independent local workspaces and browser origins. Preserve current user
conversations, drafts, baselines and provider settings. Do not add product
features or repair usability problems during a trial. Record blockers instead.
Scientific helper scripts and evaluation records may live outside the product.

No paid-model request is allowed. A disconnected Agent or fixed local response
may exercise a handoff, but cannot establish scientific reasoning or autonomous
research quality. Do not silently replace it with the configured live provider.
Missing scientific dependencies are recorded as environment blockers; their
results are not replaced by invented numbers or fixture PASS labels.

## Existing-tool comparison

The reference lane uses ordinary Python scripts or notebooks, a local editor,
files, and domain-specific libraries where available. The Web lane uses the
current shipped workbench and FlagQuantum where it actually supports the task.
Existing external scripts remain usable; do not force every problem into a
quantum circuit or translate a working scientific package solely to favor our SDK.

Both lanes receive the same frozen starter implementation, scientific inputs,
compute limits, tolerances and deliverable specification. Preparation is recorded
separately. Do not credit the Web for code the reviewer wrote outside it. Record
off-platform work required by either lane, including manual plotting or export.

Use two matched task variants. Run the reference lane first for QI-01, QEC-01
and QCH-01; run Web first for QC-01 and QD-01. Swap variants in any repeat.
This reduces some ordering effects; one evaluator still learns the task, so timing
differences are descriptive observations, not causal performance estimates.

## Execution sequence

1. Freeze the build, SDK/library versions, hardware and isolated data directory.
   Capture a clean starting snapshot and inspect which current interfaces can
   represent the required outputs. Do not assume a generic Python run implies
   support for every scientific workflow.
2. For each domain, freeze the task card and acceptance tolerances before execution.
   Produce the reference calculation with saved inputs and source.
3. Execute the Web variant through existing controls, recording each meaningful
   action, result and external workaround. Verify that the displayed artifact
   belongs to the executed code, not the current editor buffer.
4. Change one condition, retain the baseline, and compare the new outcome. Include
   a failed or rejected attempt where scientifically appropriate. Do not inject
   unsupported data and call it a successful product workflow.
5. Close the browser/runtime or start a fresh process, then find and reproduce a
   saved result. Keep scientific re-execution separate from read-only recovery.
6. Complete the record and classify what the product contributed. Inspect all
   five records together before suggesting any feature implementation.

Allow up to 30 minutes for the reference workflow, 45 minutes for Web interaction,
15 minutes for findings and a separate 15-minute revisit per scenario. These are
review timeboxes, not claims about expected researcher productivity. Track setup
and long compute separately; unfinished work remains unfinished at the timebox.

## Common outcome definitions

- **Scientific check:** `pass`, `fail`, `not_evaluated`. A PASS needs saved
  executable reference evidence and the domain-specific checks in the task card.
- **Workflow:** `complete`, `partial`, `blocked`. Complete means that the outputs
  can be inspected, compared, associated with the correct code and recovered
  through current functionality. Record unsupported steps and external work.
- **Reviewer assistance:** ordinary operation versus source edits, database edits,
  developer-console manipulation or special undocumented API commands. A path
  requiring the latter is not independent product completion.
- **Product contribution:** fewer manual transfers, fewer ambiguous versions,
  easier inspection or a reproducibility improvement, each backed by a concrete
  observed action. Complexity added by the workbench is recorded too.
- **Behavioral demand:** `not_evaluated`. An internal reviewer cannot supply
  independent adoption, preference, payment or return-use evidence.

## Decision after the review

Keep a domain eligible for a later external trial only when its scientific checks
pass, the workflow completes without product-code changes, no result is mistaken
for another code/parameter version, and at least one concrete research step is
improved over the reference lane. A faster run without matching correctness and
compute conditions does not qualify.

Classify other outcomes as `workflow gap`, `environment blocked`, `scientific
validation failed`, or `outside current scope`. Distinguish a rendering problem
from a missing scientific capability. Report counts such as “two of five designed
scenarios completed”, not domain-wide satisfaction percentages.

There is no preassigned winning domain and no requirement that four of five pass.
Even five successful internal scenarios would support only a subsequent external
trial, not product-market fit or a new-product-category claim. Recommend at most
one or two workflows for that trial, explaining the actual evidence and gaps.

## Current product evidence boundary

The prototype exercised circuit/SDK execution and QAOA research records.
This walkthrough does not establish acceptance for unmerged integrations. These checks do
not establish complete workflows for the other four domains or live-model
research competence. See [product acceptance](../../architecture/WEB_PRODUCT_ACCEPTANCE.md)
and [native workbench boundaries](../../architecture/WEB_AGENT_WORKBENCH.md).
