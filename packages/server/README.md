# `@flagqai/server`

The FlagQAI local service is a thin Host Adapter over registered agent
backends. It provides a loopback HTTP API, OpenAPI document and SSE event
stream. It does not implement an agent loop or persist a second session log.

The server defaults to `127.0.0.1`. A non-loopback bind is rejected unless the
embedding host opts in explicitly. Runtime hosts inject an `AgentBackendRegistry`;
the server never returns model credentials through its API. When the embedding
host supplies its provider manager, the loopback-only onboarding endpoint can
accept a write-only credential and pass it directly to the host credential
store; status responses expose only whether a credential is configured.

```bash
flagqai serve --port 4096
```

The `flagqai serve` command starts a headless Harness composition and injects
its real backend registry into this server. Session creation, resumption,
messages, cancellation, history, live events, permissions, and structured
questions therefore use the same agent runtime and durable logs as the
terminal client. Pending interactions remain owned by the injected backend;
the server only validates and forwards one response for each request. The
low-level `flagqai-server` binary remains available for protocol-only embedding
and has no backend unless its host injects one.

`packages/harness-adapter` now owns shared preset initialization, headless host
composition and startup/teardown. The native Cordis plugin supplies bindings;
the standalone server can consume the same adapter through
`runStandaloneServer(args, { composeHarness, startHeartbeat })`. Its default
remains protocol-only. The adapter has no import from an application directory.

The terminal and HTTP hosts share `initializeSessionPresets` and
`createSessionBackend` in the CLI's Harness adapter. Both initialize the official
preset definitions before opening an agent and use the same model routing,
preset composition, durable resume, session catalog, and session wrapper.
The HTTP host waits for the preset service; missing or invalid presets reject
session creation instead of silently exposing an agent without its tools.
Terminal rendering and browser rendering remain separate client layers.

The Harness host also injects `createWebSessionView`, which uses the terminal's
`createChannelProjection` reducer for both history and live events. The browser
paints `session.view` row deltas; attempt rollback, canonical message merging,
sequence deduplication, thinking, tools and usage accounting are folded once on
the server. Raw backend events remain available to other clients. Supported Web
slash commands use the CLI command descriptions; unsupported actions are omitted.

A projection frame carries `rows` (changed rows), `removed` (row IDs to delete),
`order` (the current row order), and `reset` (replace the projection baseline).
It also carries model, title, working state, token counts and supported commands.
Each SSE connection receives a full reset snapshot and pending interactions,
including after the bounded event buffer rolls over. Snapshots are derived from
backend facts, not written to the durable session history. Embedders without a
`createSessionView` factory retain the raw-event protocol.

Every SSE connection receives a heartbeat comment every 15 seconds, including
when the agent is idle or waiting for permission. These transport comments do
not consume event IDs, enter the replay buffer, or modify durable history.
Embedding hosts can set `eventHeartbeatMs` to a positive timer interval; keep
it shorter than the client's idle deadline. Connection close and server disposal
clear heartbeat timers.

Backends may also expose their durable session catalog. `GET /v1/sessions`
projects those records into a backend-neutral list and marks each session as
available, active in this server, or occupied by another local process. Before
resuming a durable DSH session, the Harness host claims the same cross-process
mount ledger used by the CLI and releases that claim when the API resource is
disposed. A conflicting resume fails with HTTP 409 instead of opening two
writers on one session log.

An optional model manager supplies `GET /v1/sessions/{id}/models` and
`POST /v1/sessions/{id}/model`. A switch requires an idle session with no pending
interactions. DSH returns a new resource containing inherited history; the
previous resource is disposed only after the candidate is seeded and its model
preference is committed. Failed switches leave the current resource available.
Concurrent submit, switch and dispose requests are fenced during the transition.
Provider discovery and configuration remain delegated to the Harness settings
host; response payloads never contain credentials.

The optional `contextManager` provides session context capabilities, bounded
workspace file suggestions and mention previews through `/context`,
`/context/files` and `/context/preview`. It prepares model-facing file and image
blocks before `session.submit`; the server accepts no client-supplied native
attachment IDs. Message requests may carry bounded base64 images. Input
preparation fences switch/dispose/submit mutations and refuses invalid context
without submitting a partial message. Other request bodies keep the 1 MiB cap;
messages use a 6 MiB transport cap with tighter per-image admission limits.

An embedding process may provide `webRoot` to expose the fixed FlagQAI Web
asset manifest on the same origin. Arbitrary files are never served, the API
route space stays authoritative, and the HTML response carries a restrictive
content security policy. The CLI uses this boundary for `flagqai web`.

Session actions are additive SDK operations: `/sessions/{id}/rename` writes
through the session's typed rename capability, and `/sessions/{id}/fork` returns
a new durable backend reference for the client to resume. Both require idle
sessions with no pending interactions and fence concurrent mutations while
running. Fork anchors must match an existing user-message history entry.
`/catalog/{backendId}/{sessionId}/archive` accepts only an inactive record from
a catalog that explicitly declares `deleteAction: 'archive'`; the host's mount
reservation covers the offline mutation. Deletion-only backends are rejected.

Message admission retains up to 4,096 request IDs per live resource (512
characters per ID). Repeating identical input returns its original receipt;
changing input under that ID returns `message_id_conflict`. If a backend throws
after admission, retries return `message_outcome_unknown` rather than execute
the task again. Check the transcript before sending new input. Receipts live
in memory and are released with the resource; this is not a durable delivery
guarantee across server restart. Reaching the bound rejects further admissions
until the durable session is resumed into a new server resource.

Cancellation publishes `session.control` to all attached clients. States are
`stopping`, `stopped`, `unknown`, `failed` and `none` (the prior control is no
longer active). A backend cancellation receipt describes queue withdrawal;
a `confirmed` receipt does not prove a running turn ended. `turn.end` for the
target turn, an idle/disposed status event, or an idle session after cancellation
provides that evidence. Overlapping cancel requests return `cancel_in_progress`.
Reconnect snapshots include the current control and `pending.changed` inbox
snapshot even after the bounded event buffer rolls over. These controls are
live presentation metadata; Harness still owns execution and durable history.

### Native Bash live output

The DSH session adapter observes foreground Bash jobs through the native job
registry's non-consuming `readAt` API. Async execution context links each job
to its exact root tool call, including concurrent identical commands; command
text and names are never used to guess a call ID. stdout and labeled stderr
reach both CLI and Web as transient `tool.output` events before the durable
result. Individual frames are bounded to 16,384 characters and ring loss is
explicit; the shared projector bounds the displayed tail.

The adapter does not replace Bash, consume the model's output cursor, alter
permissions or own cancellation. Stop continues through native Harness control.
Reconnecting to a live server resource obtains its current projected tail
without rerunning the command. Restarting the server restores durable results,
not transient output. Completed results remain authoritative.

This observer requires native job events and `readAt`. Older hosts, direct shell
fallbacks without job registration, nested PTC dispatches and detached background
jobs retain their existing result/job presentation. Once the foreground tool
returns or promotes to background, its live-card association is removed.

### Native session jobs

`GET /v1/sessions/{id}/jobs` returns the backend's native session-owned job roster
and non-consuming output tails. `POST /v1/sessions/{id}/jobs/{jobId}/stop` requests
termination of that job through Harness; it does not cancel the session turn or
other jobs. Unsupported backends report `supported: false`. Exact ownership
excludes unowned and foreign-session jobs even if the native list includes them.

Web exposes a Jobs panel with status, elapsed time, producer detail (including
exit code when available), progress, expandable output, and individual Stop job
controls. It refreshes every two seconds while the page is visible, with one
request at a time and stale session responses discarded. Each response contains
at most 40 jobs and 200 lines / 16 KiB of text per job; omitted output is explicit.
Refresh and session switching read the same registry; jobs are not duplicated.
This includes native foreground jobs while they run. Job history survives browser
reconnect while its Harness process remains alive; registry retention and server
restart behavior remain Harness-owned, with no new durable job store.

### Native direct-child agents

`GET /v1/sessions/{id}/subagents` returns the native direct-child roster,
observed run state and transcript support. DSH reads Harness's child catalog;
its bounded lifecycle observation is fenced by the exact delegating parent and
run ID. A newer residency epoch cannot be ended by a late prior-epoch event.
Unobserved historical children remain `unknown`, even when a durable transcript
is readable; absence from the live registry is not completion evidence.

`GET /v1/sessions/{id}/subagents/{childId}/history?before=<cursor>` delegates
to the same CLI child transcript reader: exact direct-child authorization,
read-only persistence handles, exclusion of fork-inherited parent records, and
bounded native event windows. It never resumes the child. Each page carries
`hasOlder` and `skippedFromStart`; wire text is capped at 16 KiB per field and
256 KiB per page, prioritizing the newest records with explicit `truncated`.

Web's Agents panel lists up to 100 direct children and updates every two
seconds while visible. The selected child's durable messages, reasoning and
tool calls/results appear in a separate pane. Loading earlier records pauses
automatic transcript refresh; Refresh child transcript returns to the latest
window. Selection and session changes abort pending reads and fence late
responses. The panel does not add child scheduling or nested-descendant control.
Native DSH is supported first; other backends without a roster hide the entry.

### Recorded task progress

`session.view.todos` is the latest native whole-list Todo snapshot from the
same channel reducer used by CLI. Initial SSE snapshots and live updates include
it, so reconnecting clients restore progress without submitting or replaying work
for execution. Durable `todo/write` history restores the last recorded list for
a newly opened session. Each item contains `content` and `status` (`pending`,
`in_progress`, `completed`). The SDK field is optional for compatibility with
older servers. There is no new task scheduler or UI-owned completion inference;
Todo status does not assert runtime completion or scientific acceptance.

## Settings and runtime readiness applications

`settings/` owns project configuration transactions, revision/lock/path checks
and integration catalog projection. `readiness/` owns passive Registry snapshots
and explicit heavyweight MCP preparation/activation. Native observer/Cordis
bindings stay in runtime Host adapters; scientific process execution stays in
scientific-core. Production routes and setup scripts use these canonical modules;
old `src/settings/server` and `src/readiness/server` imports only re-export them.
See [Settings](settings/README.md) and [Readiness](readiness/README.md).

## Message channel configuration

`channels/` owns CC Connect configuration, authenticated loopback status probing
and exact managed-launcher migration. Settings routes and source entrypoints
share this application; native ACP remains Harness-owned. See
[the channel contract](channels/README.md).

The catalog rename endpoint (`POST /v1/catalog/{backendId}/{sessionId}/rename`,
`{ "title": "New title" }`) updates an offline native title without opening a
session. It honors ownership guards and the backend's rename capability; open
sessions use their live rename capability only when idle. Responses never contain
conversation content. Catalog actions advertise `rename` independently of archive.

### Session automatic compaction policy

`GET /v1/sessions/{id}/compaction-policy` reads the native per-Agent policy;
`POST` updates `enabled` and `thresholdRatio` only while the session is idle.
Unsupported capabilities, active work and malformed native values are rejected.
This uses the native pressure/compaction hooks, not a browser token estimator or
a second compaction loop. The optional source workspace carries its reviewed
`dsh-compaction-basic` patch; unpatched installations report the capability as
unavailable. Browser preferences never claim that a native policy is enabled.
