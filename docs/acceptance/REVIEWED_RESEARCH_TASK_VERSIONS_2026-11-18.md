# Reviewed task versions after constraint changes

This PR extracts the constraint/version backend and native continuation contract
from the original worktree. The existing result presentation remains unchanged;
a browser constraint editor and review controls are separate follow-up work.

## Review contract

Changing constraints preserves every existing task, failure, and evidence link.
Affected latest task versions receive a proposed recheck plan. A coordinator can
replace that proposal with explicit task adjustments and rationale, but cannot
confirm it through the native tool route. The local record-bound review endpoint
accepts constraint review, recommendation, confirmation, and rejection only; it
never dispatches a Worker.

Confirmation checks the exact plan hash, current constraints, source/verifier
identities, baseline revision, and prior evidence. A successful decision reserves
fresh task/Worker identities with lineage back to earlier versions. It performs
no native activation. Stable decision IDs deduplicate concurrent confirmation and
retries across metadata service reopening. Pre-upgrade receipt snapshots are
projected through the additive review schema when replayed. Rejection and stale proposals remain
in history. If constraints are edited before any task exists, initial reservations
remain possible without an impossible review requirement.

Older tasks cannot be dispatched under revised constraints, and direct reservation
cannot bypass review when earlier task versions exist. Approved versions still
need an explicit native dispatch and another source/baseline check. The Worker
receives its approved task version and lineage, with earlier evidence explicitly
marked historical. Recovery observes all retained versions without resubmission.

Linked verification for an adjusted task must use a new report identity dated
at or after confirmation, preserve the verifier identity, and match or descend
from the exact approved source. Earlier reports are never relabelled as new
verification. This binds evidence to the task context; free-text scientific
constraints are not automatically proven by that association.

The review API derives `actor=user` from the local review route rather than an
input field; workbench tool operations remain `actor=agent`. It also checks that
the named coordinator/project is linked to the selected saved research record.
This follows the existing local workbench review model, not a new authentication
or multi-user authorization system.

## Local verification

- All 198 pinned SDK tests pass with no failures, errors, or skips, including
  19 coordination tests for concurrent review, stale source/baseline/plan guards,
  rejection, failed-task lineage, three constraint generations, new report timing,
  restart receipts, record-bound review, and constraints edited before reservation.
- Native workbench/coordinator tests pass. CLI compilation and type checking pass.
- Real Harness rc.2 acceptance passes from source and an independently extracted
  CLI package. Two existing Workers complete using local fixed responses. After
  a constraint change, explicit review reserves two new versions without execution;
  explicit dispatch executes only those versions. A second runtime/ledger restart
  retains the decision, old evidence, and new Worker IDs with zero new requests.
- All five research-result browser tests pass. The traceability scenario now
  obtains a new task version through the record-bound review endpoint, instead
  of directly reserving a replacement under changed constraints. Main metrics,
  historical failures, evidence navigation, and chat/editor drafts remain intact.
- Staged CLI package verification passes. The installed native acceptance uses
  synthetic verifier reports and local fixed responses: it verifies lifecycle
  and evidence/version bookkeeping, not autonomous or scientific result quality.

Original worktree status and the 16 protected draft/research product checksums
remain unchanged. Running local services are not restarted. No paid model calls.
