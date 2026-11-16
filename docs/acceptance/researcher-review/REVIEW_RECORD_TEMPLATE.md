# Research workflow experience record

Copy this form once per task card. Leave unobserved fields blank and use
`not_evaluated` when appropriate. Do not fill empty cells with plausible findings.

## Identity and scope

| Field | Entry |
| --- | --- |
| Scenario ID and domain | |
| Review date and evaluator | |
| Evidence mode | internal expert walkthrough |
| Task question and variant | |
| Build revision or working-tree manifest | |
| Hardware, OS, browser and local data directory | |
| SDK and scientific-library versions | |
| Source/input hashes, units, seeds and compute budget | |
| Scientific checks/tolerances frozen before execution | |
| Model mode | disconnected / fixed local responses |
| Paid model calls | 0 required |
| Environment limitations | |

## Reference and Web lanes

| Field | Reference lane | Web lane |
| --- | --- | --- |
| Actual tools and commands used | | |
| Variant and execution order | | |
| Shared starter code and preparation outside either lane | | |
| Setup elapsed time | | |
| Task active-operation time | | |
| Compute/wait time | | |
| Recovery/reproduction time | | |
| Timebox reached with unfinished work | | |
| Manual transfers of code/results/settings | | |
| External plotting/export/analysis steps | | |
| Scientific check: pass / fail / not_evaluated | | |
| Workflow: complete / partial / blocked | | |
| Original outputs and report paths/hashes | | |

Measure elapsed time from a recorded start/finish. Separate computation from
interaction; do not estimate a monetary charge from elapsed time or token counts.
Count a manual transfer when information crosses tools and the evaluator must
copy, rename, reconcile or re-enter it. Use the same definition in both lanes.

## Event and assistance log

| Time | Lane and step | Visible state and intended action | Observed outcome | Assistance or workaround | Artifact/screenshot |
| --- | --- | --- | --- | --- | --- |
| | | | | | |

Assistance codes: `A0` ordinary visible controls; `A1` existing documentation;
`A2` source inspection, undocumented API or external manipulation; `A3` product
code/database repair. A2/A3 completion is assisted, not independent completion.
Domain reference scripts are normal reference-lane tools; an off-platform script
needed to finish the Web lane is separately recorded as a workaround.

## Result and continuity checks

| Check | pass / fail / not_evaluated | Evidence |
| --- | --- | --- |
| Domain-specific scientific reference checks | | |
| Displayed result belongs to executed source and settings | | |
| Baseline and candidate are scientifically comparable | | |
| Process completion is distinguishable from verified research success | | |
| Failure and rejected outcome remain inspectable | | |
| Saved artifacts reopen without hidden external state | | |
| Explicit reproduction meets deterministic/statistical criteria | | |
| Refresh/reconnect does not duplicate work | | |
| Unsent chat and unsaved editor drafts remain intact | | |

## Friction and contribution

| Finding | Observed evidence | Category | Effect on the research task | Workaround and cost |
| --- | --- | --- | --- | --- |
| | | correctness / completion / environment / interpretation / continuity / presentation | | |

Record one concrete benefit or state that none was observed. Attribute benefits
to the Web workflow, SDK, external library or reviewer preparation separately.
Do not count a local fixed response as evidence of live-Agent intelligence.

## Decision

- Scientific outcome:
- Workflow outcome:
- Largest blocker or additional burden:
- Concrete advantage over the reference lane:
- Remaining untested scientific or interaction assumptions:
- Next classification: eligible for later external trial / workflow gap /
  environment blocked / scientific validation failed / outside current scope.
- Behavioral demand, willingness to pay and retention: **not_evaluated**.
- Confidence and limits: single internal scenario; no population inference.
