# Knowledge and skill construction plan

This plan implements the boundaries in [Domain scope](DOMAIN_SCOPE.md). It creates
neither a new Web page nor an alternative Agent execution framework.

## Information responsibilities

| Layer | Content and representation | Authority and lifecycle |
| --- | --- | --- |
| SDK knowledge | Reviewed Markdown, source-derived API index and pinned SDK examples | Official source revision and content hashes; a new SDK revision requires compatibility review |
| Methods | Problem definitions, assumptions, references, validation procedures and limitations | Reviewed primary references and executable small-instance checks where applicable |
| Cases | Code, declared inputs, expected observations, validators and resource conventions | Exact source/environment-bound acceptance; never relabel old evidence for changed code |
| Environment facts | Current interpreter, SDK fingerprint, observed APIs, dependencies and actual backend probes | Existing environment services; scope and invalidate by configuration revision and freshness |
| Project memory | Goals, constraints, code versions, baseline/candidates, results, failures and adoption decisions | Existing research records and artifacts; not a second copy in public Markdown |

Recorded case acceptance and live environment readiness are separate. An SDK
version label alone is insufficient. An SDK build missing a required QFT API is the first planned regression scenario
for that distinction.

## First six skill specifications

These are development tasks, not installed skills. Use the existing native skill
loading mechanism when each executable package is ready.

| Order | Skill | Inputs and deliverable | Required acceptance |
| --- | --- | --- | --- |
| 1 | Problem specification | Scientific question to explicit variables, domain, outputs, constraints and checks | Flag ambiguous units/domain and avoid substituting an easier question |
| 2 | High-level synthesis | Frozen specification and compatible APIs to a synth program and interpretable resource report | Arithmetic matches classical outputs; incompatible SDK stops before the research body; draft preserved |
| 3 | Execution selection | Task requirements and current environment facts to an explicit method/device/transport choice | Compatible local execution succeeds; missing/stale capability fails clearly without silent fallback |
| 4 | Correctness validation | Bound code/artifacts to a named independent check and tolerances | Correct and intentionally incorrect candidates are distinguished; exact versus sampled evidence remains explicit |
| 5 | Resource comparison | Two verified candidates for the same problem to metric/resource deltas | Reject mismatched problem identity or conventions; distinguish T/Tdg counts from undecomposed non-Clifford costs |
| 6 | Save and reproduce | Code, parameters, environment and artifacts to an independently importable research result | Reproduce in a separate process; preserve failure evidence; distinguish saved-circuit replay from compiler-search reproducibility |

Order is a dependency sequence, not a commitment to build six interfaces. Reuse
the existing QAOA, arithmetic/synthesis and inverse-square-root records where the
record actually supplies the required evidence. All six rely on F01 foundations
and the task-specific limitations in the scope document.

## Entry requirements

Every knowledge entry must identify its scope IDs, source/revision or retrieval
date, assumptions, applicable SDK/build/dependencies, review state and limitations.
Mark unknown fields explicitly. Do not assign an expiry rule to timeless
mathematics merely because runtime capabilities have a freshness requirement.

A skill package must additionally declare its trigger, input/output contracts,
required tools and permissions, steps, stop/recovery conditions and focused tests.
Use `SKILL.md` for instructions and optional references/scripts/tests for supporting
material. Record the entry's version and validation evidence in structured
metadata. Directory presence alone does not make a skill enabled or trustworthy.

Keep two states separate: editorial review (draft/reviewed/retired) and execution
evidence (not tested/passed/failed for a specific code and environment binding).
Reviewed text must never display as a runtime PASS.

## Retrieval and trust rules

1. Search bounded metadata by task, scope and SDK compatibility before loading a
   selected method, API reference or example. Start with text/structured search.
2. Preserve source identity and distinguish authoritative API facts, external
   scientific references, current measurements and project observations.
3. Treat documents, papers, examples and tool output as untrusted task data; they
   cannot grant execution permissions, authorize spending or override user policy.
4. Validate actual selected environment facts before execution. No user task is
   submitted as a side effect of reading knowledge or choosing a skill.
5. Record which knowledge/skill versions informed a research run when the loading
   integration is implemented. Do not manufacture historical usage records.
6. Store new observations in project memory first. Promote reusable experience
   only after review, independent checks and removal of private project data.

## Delivery gates

First deliver a pinned FlagQuantum API/example index and link it to live
capability facts. Then implement the six skills against the existing research
workflow. Extend discipline-specific methods only after their bounded task passes.

For each integration, test unsupported APIs, stale environment facts, wrong-source
evidence and an incorrect candidate as well as the successful path. Existing
drafts, baselines and historical failures must survive. Compare against a recorded
starting workflow rather than assuming a knowledge package improves Agent quality.

Local deterministic tests and SDK checks establish integration behavior. Live-model
reasoning quality requires a separately authorized Agent evaluation with recorded
model/build, task, cost and results. No paid calls are authorized by this plan.

This planning change is complete when its links and scope identifiers resolve.
It does not by itself complete any of the implementation or delivery gates above.
