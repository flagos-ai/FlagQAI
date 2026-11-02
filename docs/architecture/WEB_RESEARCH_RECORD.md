# QAOA research records

View research record opens a read-only modal from an existing QAOA outcome card.
It does not add navigation chrome, a new Agent loop, or a compute/model request.
The original request, baseline and iterations remain linked to native turn/run
history and immutable source/archive identities.

## Membership and verification

Native conversation turns provide original user requests and Agent-created run
references. All attempts in a participating request remain visible, including
failures with no archive. Explicit source lineage links later iterations to their
parent run, source SHA-256 and optimized archive ID/SHA-256. UI-origin runs are
read as candidates but join only through verified lineage; matching names, graph
shapes or creation times alone never establish membership.

The loader follows at most 16 ancestor versions and reads at most 64 referenced
runs. Larger or missing context produces a visible incomplete-history notice.
Missing runs remain unavailable entries when their request is known. Cyclic,
invalid or mismatched lineage cannot become a verified research baseline. Saved
metrics use the same source/archive provenance checks as QAOA outcome cards;
a different graph is not accepted as the same objective.

Each selected run exposes its code snapshot, artifacts and exact original run/log
inspection. Version metrics include expected cut, sampled optimal-cut rate,
compiled depth/gates and recorded Python elapsed time. The uniform baseline is
also retained. Recorded durations include search, replay and failed processes;
missing durations are disclosed. Model monetary cost is explicitly unrecorded,
not inferred from compute time, token counts or previously authorized budgets.

## Decisions and export

Adoption is an explicit user decision, never an automatic best-score selection.
A selected version must have verified provenance and matching saved seeded replay.
The decision binds run ID, full source hash, optimized archive ID/hash and an
optional note. It is stored per root run/source in this browser and can be cleared
without deleting evidence. A stale stored choice is reported as unverifiable;
it is not silently replaced. Storage errors preserve the previous choice.

Download research record exports a versioned JSON manifest with requests, lineage,
source snapshots, recorded settings/metrics, archive hashes and the validated
adoption. Failed-process output is limited to the last 8,000 characters with an
explicit truncation flag. Original .fqx archives are separate downloads; the JSON
is an evidence manifest, not a new experiment format or an archive bundle.

The separate Export research package action bundles exact sources and original
archives in a validated ZIP. The top-bar Research catalog restores independent
records; see [Portable research packages](WEB_RESEARCH_PACKAGES.md).

## Local validation

Unit tests cover scoped membership, descendants/UI candidates, unavailable history,
identity mismatches, adoption binding, honest lower-scoring choices and replay
refusal. The existing scripted QAOA browser journey checks original goals, the
root and iteration attempts, decision persistence, export contents, exact baseline
comparison and failed-run inspection while preserving the editor draft.
Real-session review uses the earlier completed QAOA records in an isolated browser
with model-message submission blocked. No additional paid model call is needed.
