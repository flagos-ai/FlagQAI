# Durable message delivery acceptance — 2026-11-13

## Scope

The native headless host persists adapter-level admission fingerprints and
receipts under `DATA_DIR/message-delivery`. Harness remains authoritative for
execution and conversation history. The SDK exposes an uncached status lookup
for an existing session resource and client message ID. This change adds no Web
controls and does not migrate or edit chat/editor drafts.

The branch starts at merged PR #32 (`9788468`). Existing unrelated working-tree
changes are excluded. No credentials, paid models or running user sessions were
used by acceptance.

## Reproducible checks

From `apps/cli`:

```sh
npm run compile
npm run verify:message-delivery
npm run verify:installed-message-delivery
npm run verify:headless-source-boundary
npm run verify:headless-type-boundary
npm run verify:local-server-bundle
npm run verify:package
```

All checks passed locally on macOS with Node 26.8.2. The staged package contained
2,666 files and 32 entry targets. Source and relocated-package acceptance each
passed all eight tests. Both tests are included in the CLI CI matrix for Linux,
macOS and Windows; local success does not establish CI results on those systems.

The relocated check builds the real release archive, extracts it outside the
repository, and runs the same HTTP/crash tests against its packaged server and
SDK. It does not install dependencies or import repository runtime source.

## Verified behavior

| Scenario | Evidence and expected behavior |
| --- | --- |
| Receipt lost after server response | The test transport consumes the response and then throws. After forcibly terminating the server process and resuming the native session in a new process/resource, lookup returns `accepted`; identical retry returns the saved receipt. Backend ledger contains one submission. |
| Request lost before server dispatch | The test transport throws before making an HTTP request. After process restart, lookup returns `not_received`; two sends with the same original ID produce one ledger entry. |
| Crash between admission and receipt | The backend writes its submission ledger and blocks. The process is forcibly terminated. After restart, lookup returns `unconfirmed`; retry returns `message_outcome_unknown`, and ledger count stays at one. |
| Explicit refusal and preparation | While context preparation is held, lookup returns `unconfirmed` and competing mutations are fenced. Refusal/reason survive resource disposal and resume. Changed placement under the same ID conflicts. |
| Legacy and memory-only sessions | Missing IDs in resumed sessions without tracking evidence remain `unconfirmed`. Fresh sessions can establish `not_received`; known receipts remain queryable. |
| Independent admission writers | Two store instances race the same ID; only one exclusive admission wins. Different working directories do not share records. Truncated records and unavailable storage cannot admit that ID again. |
| Concurrent HTTP submissions | Two identical sends dispatch once. Changed attachments under the original ID conflict. |
| Unavailable persistence | Fresh session initialization fails; resumed-session lookup/submission also fail instead of claiming absence or calling the backend. |

## Limits

These are real local HTTP requests and separate server processes backed by a
deterministic fake Harness backend. Its QAOA-labelled prompts identify the
recovery scenario; the tests do not rerun quantum computation, validate a model,
or establish browser draft/recovery behavior. The existing user Web and native
Agent processes are left running.

The guarantee is at-most-once adapter dispatch for tracked IDs while delivery
evidence is retained, not transactional exactly-once execution across Harness
and the filesystem. An admitted request with no durable receipt remains unknown
and requires transcript inspection rather than automatic resubmission. A status
query observes a point in time; any retry must retain the original ID and input.

Legacy sessions cannot establish non-delivery for IDs predating tracking.
Deleting/moving the delivery directory separately from its native session data
invalidates that evidence. No automatic retention expiry or power-loss durability
guarantee is introduced in this change.
