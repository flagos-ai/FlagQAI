# Constraint review in saved research results

This PR extracts the browser review interaction from the original research team
UI and connects it to the record-bound API merged in PR #107. Existing metrics,
results, exports, baseline controls, and candidate iteration stay above the
collapsed team section. No new page or automatic execution is introduced.

## Interaction

The user expands project constraints, edits a draft, and reviews the resulting
versioned task changes. Template suggestions are identified and their repeated
rationale is summarized once; explicit coordinator rationale is retained per task.
Confirmation reserves the reviewed versions through the existing backend.
Rejection retains prior tasks, failures, and evidence.

Confirmation offers a continuation request addressed to the exact coordinator
and approved task IDs. Copying writes only the clipboard, preserves chat drafts,
and asks for inspection before explicit dispatch. The pure request builder
refuses unconfirmed, superseded, mismatched, or mixed-revision task sets.

Constraint drafts retain stable request IDs. A response cannot overwrite text
edited after submission. Per-tab session storage preserves separate window drafts
through refresh; local storage remains a compatibility/new-tab fallback for the
previous draft format. A revision conflict preserves text and requires explicit
review against the newer revision before resubmission.

If a mutation receipt is lost, the UI reloads authoritative coordination and
matches the persisted action/request ID in history. A confirmed outcome clears
the obsolete network error without resubmitting or running a task. Requests abort
when the review component unmounts. Proposed plans refresh through existing run
reads while the team section is expanded.

The constraint input retains manual vertical resizing. Compact spacing and
existing controls/focus styles are reused; no fixed header region is added.

## Verification

- All 303 Web unit tests pass, including exact continuation identity, immutable
  inputs, unconfirmed/superseded task refusal, and mixed-revision refusal.
- All seven research-run browser scenarios pass. New coverage includes typing
  newer text while a mutation response is delayed, lost confirmation receipt,
  authoritative outcome reconciliation, refresh, clipboard contents, independent
  window drafts, stale constraint updates, rejection, and obsolete approval.
- The browser verifies that confirmation and copying do not add native claims,
  archived report bytes stay unchanged, earlier evidence remains historical, and
  editor/unsent chat drafts survive the entire flow. No model or compute job runs.
- The final compact review screenshot was inspected. Type checking, production
  build, formatting, and staged CLI package verification pass. CLI runtime files
  do not change, so no additional installed native acceptance is needed here.
- One intermediate local run stopped in the existing baseline scenario with a
  `Failed to fetch`; subsequent clean runs passed all seven scenarios. Browser
  artifacts use isolated synthetic verifier reports, not scientific acceptance.

The original dirty worktree and all 16 protected draft/research product checksums
remain unchanged. Existing local Web and Agent services are not restarted.
No paid model calls are made.
