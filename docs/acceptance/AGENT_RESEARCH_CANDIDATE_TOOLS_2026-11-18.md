# Agent research candidate tools

Expose the existing InvSqrt candidate review workflow to native Harness through
read-only bounded source inspection and one immutable text replacement proposal.
Inspection returns source hash and project revision; proposals require both,
plus an explicit parent, rationale and stable request ID. The existing staging
function enforces a unique patch region, transactional project revision checks,
content identity and restart-safe deduplication. Proposal creates a review-state
record only. The Agent tool cannot start verification, adopt a candidate, or
replace a user draft; review and verification remain in the Web workflow.

Validation uses fixture-only verifier evidence and scripted bridge requests.

Focused validation: 17 native tool tests, 16 HTTP API tests, 11 bridge tests and
5 package tests passed. CLI source compilation and staged-package verification
passed (2,671 files, 32 targets). The proposal tool tests run in Web acceptance CI.
The independently extracted package checks inspection and proposal dispatch with
a stable request ID and asserts no verification, adoption or execution dispatch.
