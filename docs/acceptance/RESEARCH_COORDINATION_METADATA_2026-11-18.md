# Durable research coordination metadata

This change extracts the persistence layer from the original project coordination
work. Native Harness remains responsible for child sessions, execution,
permissions, and parent delivery. This layer records relationships and receipts;
it does not start a process, call a model, or expose a dispatch HTTP endpoint.

## Recorded state

A coordinator session owns its project task records. Tasks retain an immutable
worker identity, constraint revision, archived source SHA-256, verifier SHA-256,
and project baseline revision. A claim transaction changes `reserved` to
`admitting` before native admission. Repeating either the same request or a new
claim for that task never grants another activation. A crash between claim and
admission therefore requires inspection, rather than an automatic second launch.

Observations preserve failed and completed outcomes when a cold native catalog
reports an unknown session. Constraint changes retain earlier tasks and reports,
mark their evidence as historical, and block stale claims or evidence linkage.
A changed project baseline, source, or verifier also blocks those operations.
Stable request IDs deduplicate evidence and observation receipts across restarts.

The initial source adapter accepts fully verified InvSqrt archives. Other
research formats need an explicit source adapter. Linked evidence comes from
validated archived reports and must match the task source or descend directly
from it with the same verifier. Existing research run details expose these links
in the `coordination` field. Worker admission, native tool routing, and UI controls
are follow-up integrations; this PR establishes their durable metadata contract.

## Local verification

- Ten focused tests cover independent-process and threaded claim races,
  persistence after reopening, receipt replay, immutable archive preservation,
  owner separation, failed outcomes, constraint/baseline conflicts, foreign
  evidence, corrupted reports, and changed verifier versions.
- The full pinned FlagQuantum SDK lane passes all 189 tests with no skips,
  failures, or errors. Its report is generated separately from the source tree.
- Staged CLI package verification passes (2,666 files; 32 entry targets). CLI
  runtime source and the installed package surface do not change in this PR.
- An additional temporary-copy acceptance uses the existing verified archives
  `7beabff806a9bf954a765c7e2b8a9ef6` and
  `c8be914fbfc64643a937c0a5b81f24bb`. Two tasks retain their actual code/report
  identities and evidence through coordinator reopen; both repeated claims are
  refused. No research code or model is executed. Original archive file hashes
  remain unchanged.

The original worktree, editor drafts, research products, and running local Web
and Agent services are preserved.
