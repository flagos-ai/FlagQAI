# Saved research outcomes in the Agent transcript

This extraction adds a read-only outcome card above the process fold for each
Agent turn with a confirmed `research.present` or `research.propose` bridge
receipt. Plain Agent text, UI actions, failed receipts and invalid IDs cannot
create a card. Repeated presentations select the latest saved record while
retaining earlier distinct records as collapsed links.

The card reads the actual saved record and checks its identity. A verified
conclusion requires a saved code SHA-256, completed status, and both baseline and
candidate verifier passes. Resource costs and absolute differences come from the
archived comparison, explicitly labeled as such; a changed current project
baseline is not presented as the historical comparator. Unchanged and higher
resource costs are distinguished from improvements. Failures and interruption
states retain their saved error details.

The existing Jobs record remains the place to review patches, verify, adopt, or
restore a baseline. The card only navigates to that record after re-reading and
checking its identity; an asynchronous session change rejects navigation.
Preparing another iteration appends a bounded, source-hash-bound request to the
existing chat draft and requires an explicit send. It neither replaces editor
code nor runs, verifies, adopts, or resubmits a task. A full chat draft is retained
and a failed append can be retried. Record-read errors retain the last confirmed
record with a stale notice and disable iteration preparation until a successful
reload. Pending records poll; saved terminal records refresh on the shared
research-change event or explicit retry.

## Acceptance

- All 308 Web unit tests pass. The new cases cover receipt ordering/filtering,
  missing baseline/candidate validation, missing source versions, nonfinite costs,
  unchanged/higher/lower costs, and terminal-record-only iteration preparation.
- All nine isolated research browser scenarios pass. The new scripted-Agent case
  verifies saved metrics and source identity above Worked for, Follow-off page
  retention, earlier-record navigation, failed verification details, mismatched
  read rejection and successful reload, append-only iteration preparation,
  full-draft error/retry, and refresh recovery of both drafts.
- That browser case confirms no extra Agent submission after preparation, no
  Python/compute job creation, and unchanged saved report bytes. Saved verifier
  records are synthetic fixtures; this acceptance does not claim new scientific
  validation or autonomous optimization.
- The outcome screenshot was visually inspected at the default sidebar width.
  Web types, build, formatting and staged CLI package verification pass; the
  package remains 2671 files and 32 entry targets. Native execution and package
  source are unchanged, so another installed-native acceptance is not required.
- The original worktree status and all 16 protected draft/research-product
  checksums remain unchanged. Existing services are not restarted. No paid model
  is called.
