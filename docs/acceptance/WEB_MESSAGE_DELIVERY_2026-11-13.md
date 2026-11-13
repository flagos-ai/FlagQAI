# Inline Web message delivery acceptance — 2026-11-13

## Behavior

Pending sends appear at their original position in the conversation with
`Sending…`, `Delivery unconfirmed`, or `Not delivered`. The previous top-level
retry banner is removed. Status reconciliation waits for the native projection,
queries the original send ID, bounds each lookup, and never automatically sends
input. Errors and unknown outcomes cannot enable retry.

An explicit retry after `not_received` retains the original ID, complete payload
and captured workspace context. A definite backend refusal requires a new ID
only when the user explicitly retries, since the old ID already owns a refused
receipt. Refresh discards saved negative status evidence and checks again.
An earlier negative lookup continues to reconcile so delayed acceptance can
remove the pending message without another send.

Resource replacement remaps pending delivery only when backend, durable session
and working directory match. Unresolved delivery blocks switching conversations
or models. Dismiss is offered only for a definite negative outcome; it does not
clear the chat draft. Confirmation clears a matching original chat draft and
preserves newer text. Editor drafts are never mutated by delivery recovery.

The workspace proxy now exposes the read-only per-ID lookup through the same
loopback target, workspace ownership and same-origin guards as other Agent
routes. It does not permit arbitrary forwarding or POST to the lookup path.

## Checks

From `apps/web`:

```sh
npm run typecheck
npm test
npm run build
npm run test:e2e -- message-delivery.spec.mjs
npm run test:e2e -- workbench.spec.mjs --grep 'QAOA Max-Cut reference:|scripted Agent streams tools'
```

The isolated browser runner also requires compiled CLI fixture modules. Set
`FQ_LOCAL_PYTHON` to an interpreter containing the pinned SDK/runtime for existing
research journeys. CI supplies these dependencies. No provider credentials or
paid models are needed.

Five new Chromium cases passed locally, with zero retries:

1. A request dropped before reaching the server survives refresh and service
   rebinding. Explicit retry uses the exact original input/ID. Its receipt is
   then dropped; a second restart restores acceptance without a third send.
2. A saved accepted receipt with no transcript echo is recovered after restart
   through the uncached status endpoint.
3. Failed/unknown lookups keep retry unavailable and perform no submission.
   Once actual absence is established, a manual retry dispatches once.
4. Definite refusal survives refresh. A user retry creates a new ID with the
   same original payload; dismissal preserves newer chat and editor drafts.
5. A delayed original request supersedes an earlier absence lookup. Read-only
   reconciliation removes the pending message without a second browser send.

Web typecheck/build and all 237 unit tests passed. All 11 Python proxy tests
passed, including encoded IDs and foreign workspace/origin, malformed path and
wrong-method rejection. The CLI staged package remains 2,666 files / 32 targets;
its eight relocated-package delivery tests also passed.

Both existing browser regressions passed: lost-receipt/refresh with streaming
tools, and the real SDK QAOA Max-Cut journey covering optimization, comparison
and reproducible archives. The latter used the existing SDK 0.4.0 / PyTorch
2.13.0 environment with scripted orchestration and no model calls.

The new browser scenarios use QAOA-labelled saved payloads and a scripted
backend; they establish transport/UI behavior, not quantum results or model
quality. The fixture restarts its protocol server within the fixture process;
actual process termination/persistent receipts are covered by PR #33's tests.
The user's running Web/Agent and existing dirty workspace were not modified.

## Limits

This change depends on the durable delivery backend from PR #33. Older servers
without the lookup endpoint keep uncertain messages unconfirmed rather than
offering an unsafe retry. Browser session storage remains the pending-send
store; no cross-device/multiple-tab delivery queue or automatic resubmission is
introduced. User acceptance evidence is distinct from the local scripted tests.
