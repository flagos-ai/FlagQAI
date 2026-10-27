# `@flagqai/harness-adapter`

Shared host composition for FlagQAI's native Harness embedding. This package
has no application imports, renderer, agent loop, session log or credential
store. The embedding Cordis plugin supplies native service bindings.

`createHarnessComposition(config, bindings)` initializes presets before opening
native services, resolves the startup model through the existing route resolver,
and combines the backend registry, interaction answerers, session projection,
model/context/provider managers and mount guard. It retains backend-owned
execution and persistence. Partial composition failure releases interactions and
backend resources, while preserving the original startup error.

`startHarnessHost` listens through an injected protocol-server factory, starts
the optional mount heartbeat and returns one awaited, idempotent `close()`.
Failed listening or heartbeat startup closes already-acquired resources. Cordis
owns the embedding scope; the adapter owns resources acquired for that host.

`initializeHarnessPresets` is shared by terminal and HTTP entry points. Native
registry failures propagate. Legacy packaged-preset installation failures warn
without replacing the native preset resolver's validation.

The CLI supplies its existing native implementations and bundles this package
at build time. The standalone server accepts `options.composeHarness` and uses
the same lifecycle; without an injected composition it remains protocol-only.
There is no implicit backend installation or global profile discovery.

## Headless interactions

`createInteractionRouter` owns per-agent interaction routing and notification
subscriptions without importing a client or vendor package. Hosts inject native
approval and question stores, route their protocol requests by stable agent ID,
and register native hook disposers. Unknown agents return `undefined` so the
binding can preserve its protocol's fallback behavior.

Native stores remain responsible for approval validation, question ordering,
answers and abort errors. The router emits request/settlement notifications;
these are transport notifications, not a replacement session log. Disposal
cancels pending requests, drops store subscriptions and removes registered hooks
once. It continues cleanup across agents and hooks even if a disposer throws,
and rejects new bindings after shutdown. The CLI binding supports both legacy
question providers and modern request waterfalls. Interaction factories may be
asynchronous so the embedding host can load the packaged adapter before assembly.

## Agent resolution

`createAgentResolver` coordinates new and resumed agents through injected native
bindings. It retains preferred/configured preset selection, validated startup
routes, persisted preset/model recovery, borrowed live-agent reuse and mount
reservation handling. A complete configured model route overrides a resumed
route; incomplete pins do not merge with recorded model selections. Missing
recorded routes remain delegated to native resume defaults.

Explicit resume failures never create a fresh session. If a resumed handle has
already been acquired and final route reconstruction fails, it is disposed
before abandoning the reservation; cleanup errors are reported separately from
the original failure. Borrowed live agents are never disposed by this resolver.
The existing advisory behavior for a new-session ledger announcement failure
is retained; resume mount refusals remain hard failures.

CLI bindings still provide native agent API calls, branded session IDs, preset
composition, persisted-log readers, model validation, preferences and mount
reservations. The shared resolver has no renderer, filesystem, credential store,
vendor imports or agent loop.

## Provider configuration

`createProviderManager` supplies status, draft model discovery and provider
configuration through structural native settings/credential bindings. It never
owns a credential store. Public responses expose credential presence only;
environment credentials remain read-only. Existing custom headers and model
metadata survive targeted profile updates, and a rejected profile restores the
previous stored credential. Default-model persistence failures explicitly report
that the provider was already saved.

The host supplies its credential-reference convention and model preference
writer. Provider factories may be asynchronous; host composition awaits them and
releases already-acquired resources if loading fails. CLI onboarding continues
to use native settings services and its existing interactive wizard.

## Workspace files

`createWorkspaceFileScope` wraps native file operations with the existing Web
workspace confinement rules. It canonicalizes the workspace and each target,
rejects outside paths and sensitive `.git`/`.env` components, filters sensitive
directory entries, and enforces the 512 KiB text preview limit before reading.
Stat, text, bytes and directory reads recheck targets rather than trusting a
previously resolved display path. Native byte read cancellation and budgets are
forwarded; absent byte support stays absent.

This service requires a local absolute workspace. It retains the existing
realpath/check/read semantics; it does not add an atomic filesystem sandbox or
change image admission. Web context orchestration, native model capability
lookup and the CLI mention expander are still native bindings.

## Model switching

`createModelManager` coordinates model discovery, default preference commits and
native Harness forks through injected bindings. Other backends still delegate
to their in-place model capability. Busy sessions and unavailable provider/model
pairs fail before agent acquisition; preset composition and mount reservation
remain native operations. Successful forks retain native session seeds, model
records, controls and workspace attachment before settling the reservation.

On failure the exclusive owner (wrapped session or raw handle) is disposed,
then the reservation is abandoned and child mount released. Cleanup failures
are reported separately and do not prevent subsequent cleanup or replace the
original switch error. The source session remains borrowed throughout.

## Persisted log codec

`sessionLogFrames` owns bounded reads, physical file stamps and tolerant decoding
of concatenated Zstandard session-log frames. `sessionLogHeader` narrows foreign
persistence headers and classifies roots, user forks and delegated runs without
confusing lineage with origin. Both remain synchronous; the durable log remains
Harness-owned. CLI session listing and recovery consume compatibility exports,
not duplicate codecs.

The CLI's private `#flagqai/harness-adapter/*` imports map to the packaged shared
source and declarations. Build commands stage these files before TypeScript
compilation, so the same synchronous imports work in source regressions and
relocated npm packages. No dependency or compiled-file patch is introduced.

These codec files retain dsh-TUI's MIT license in `session-log/LICENSE`. They
were moved from the CLI import at `c2eee95218d1decfce138f7d31ef7099cc391d00`;
FlagQAI changes their module location and packaging, not the log format.
`sessionLogDigest` also owns bounded title/model summaries, chronological
previews, append-only suffix scans and progressive metadata recovery. The
original cancellation and inconclusive-read behavior is preserved; unreadable
logs cannot be classified as proven empty. Its structural declarations keep
native consumer types compatible without importing any CLI ports.

`createSessionIndexStore(dataDirectory)` owns derived index decoding, warm-cache
invalidation, schema compatibility, branch notes and best-effort atomic writes.
Each instance receives an explicit data directory; the CLI binds one instance
to its existing directory without relocating user data. Separate directories
do not share in-memory state.

`createSessionListingSnapshotStore(dataDirectory)` owns validated first-paint
snapshots scoped by the public JSONL source configuration and latest-listing
ordering. `createSessionMetadataRecovery(store)` owns a per-instance recovery
queue with deduplication, priority, backoff and physical-generation checks.
`createSessionListing(bindings)` composes these with the index and native
artifact-location/history callbacks. It retains revision hits, bounded append
scans, cold-list partial updates, lineage counts and deterministic ordering.
Enumeration failures and cancellation do not overwrite successful snapshots.

The CLI provides one shared set of these services to its existing consumers;
separate clients can instantiate the same read/cache logic for their own data
scopes. Durable persistence, legacy artifact lookup and user history remain
owned by their original runtime bindings. Native session coordination is shared
as described below.

## Migration boundary

This is an incremental extraction, not a completed runtime split. Native session
bindings, native approval/question stores, backend loaders, mount ledger, model preferences and shared projection
still live in `apps/cli`. They are injected through bindings; this package does
not import them. Future changes can move those implementations behind the same
interfaces without creating a second Runtime or rewriting terminal interaction.
The source/bundle copy is retained until workspace packaging is unified.

## Native session bindings

`native-session` owns DSH session coordination through typed native bindings:
shared durable-event taps, transient frames, pending-input receipts, cancellation,
history translation and listener cleanup. It has no CLI or vendor imports.
The CLI DSH adapter supplies event subscriptions, the native message constructor,
translator factories and service capabilities. Harness still owns the agent loop,
inbox execution, approvals, compaction, child scheduling and persistence.

The wrapper retains synchronous submit failures, borrowed versus owned handle
disposal, raw-before-translated ordering, inactive stale callbacks, and separate
history translators. Disposal starts every owned resource cleanup synchronously,
including native handle revocation before compaction settlement; it is reentrant
and idempotent, awaits all settlements and retains the first cleanup failure.
This creates no new runtime or event authority.
The derived implementation and declarations retain the MIT notice in
`session-log/LICENSE`, with import provenance in the repository notices.

## Child transcripts and native service views

`child-transcript` reads bounded windows from the public persistence range API.
It verifies direct-child catalog ownership, stored lineage and exact inherited
cut, rechecks binding identity after awaits, probes log length within a fixed
budget and closes read handles once. Native format/content helpers and a fresh
translator are injected; it does not import vendor packages or CLI code.

`session-subagents` projects parent-scoped lifecycle runs and exposes the bounded
history reader; `session-jobs` reads owner-fenced, non-consuming output tails.
Both delegate interruption/cancellation to native services. The CLI entries
provide host service lookups and carrier-scoped lifecycle event bindings.
Their derived modules retain the original MIT notice in `session-log/LICENSE`.

## Session transactions

`session-compaction` owns one manual transaction at a time, rechecks native
agent state after extension decisions, propagates cancellation and waits for
settlement on disposal. Its native binding resolves the preset-scoped service
and extension policy; Harness alone creates the compaction checkpoint.

`session-actions` coordinates durable rename and fork operations through typed
ports. It validates a selected user message, preserves inherited seed metadata
and legacy/v3 turn closure, delegates preset composition and native agent
creation, records metadata, attaches the workspace and releases the temporary
handle/reservation. Native format, log, mount and preset services remain bindings;
the shared adapter does not implement an agent factory or persistence store.
Both derived modules retain the MIT notice in `session-log/LICENSE`.

### Native live tool output

`subscribeNativeToolOutput` owns non-consuming job-ring observation and
asynchronous top-level Bash call correlation. The embedding host supplies native
execution hooks and the owner-scoped job service; the adapter never executes a
tool or consumes its model-facing cursor. Tracking remains bounded to 256 jobs
and individual output frames to 16,384 JavaScript string code units. Read/publish failures cannot change tool
settlement, and disposal releases both subscriptions. This Node-only adapter is
used by the native session host, not by browser code.

### Native event translation

`createNativeTranslator` translates decoded native DSH durable events and
transient assistant frames into the shared agent event vocabulary. Each instance
owns its frame revision fence and open-call presentation state. The host binds
native replay preparation, message compatibility, lazy attachment resolution and
tool presenters through typed ports. The CLI retains native pricing policy and
its exhaustive event capability classification. Translation does not add durable
facts, run tools, or replace the shared projector's attempt/sequence deduplication.
The derived implementation retains MIT provenance in `session-log/LICENSE`.

### Cross-process session mount ledger

`createSessionMountLedger({ dataDir })` owns the same-machine advisory mount
ledger, atomic claims, token-checked lock handling, bounded claim retry and
in-flight reservations. The CLI retains its native data-directory binding and
existing exports. One process-owned service is reused per resolved directory
path, so repeated host bindings share reservations; separate directories keep
independent state. All hosts sharing a ledger must use the same directory path.

Display reads remain best-effort, while authoritative reads fail closed on
corrupt or unreadable evidence. PID liveness, never heartbeat age, decides owner
expiry. This ledger does not replace the native session store's writer lock,
implement persistence, or permit multiple independent writers. The derived
implementation retains the MIT grant in `session-log/LICENSE`.

### Live and persisted session compatibility

`createLiveSessionCompatibility` owns native snapshot feature detection,
exclusive offsets, physical inherited-prefix metadata, listing fields and
inclusive source-log slicing. It rejects unknown cuts, invalid boundaries and
open turns rather than inventing history. The host binds native offset branding
and interrupted-turn event construction; native append/create APIs remain host
bindings. Seed extraction never calls a native fork factory.

`createPersistedSessionReader` prepares native event compatibility before a
read, prefers read handles over legacy `load`, preserves inherited metadata and
always closes an acquired handle. Native failures do not fall back to another
read path. The native service still owns persistence and validation; this adapter
does not implement a store. Both derived modules retain the MIT grant in
`session-log/LICENSE`.

### Session log artifact access

`createSessionLogAccess` owns generation selection, bounded plain/zstd reads,
legacy packed-row expansion, inherited-cut inspection and tolerant title reads.
It also owns the existing offline compressed-log rename/delete helper behavior.
Roots are resolved by a host callback at call time; the native decoder is lazily
loaded through a host binding, with a self-contained legacy fallback.

Read budgets, torn-final-frame recovery, corrupt/over-cap failure markers,
compressed-only mutation lookup, append-only title writes and canonical deletion
containment remain unchanged. Native event-catalog registration stays in the CLI.
These helpers do not replace the native durable store or writer lock; callers
must retain the existing rule that offline mutation targets are not live-owned.
The derived implementation retains MIT provenance in `session-log/LICENSE`.

### Project Skill roots

`PROJECT_SKILL_ROOTS` declares canonical and transitional project instruction
roots for settings and repository auditing. The native Preset's filesystem Skill
provider uses the same two roots. Neither settings nor auditing implements a
Skill runtime: Harness retains discovery/loading authority. Settings refuses
ambiguous duplicate names before mutation and preserves file containment and
revision locks when editing the owning instruction file.
