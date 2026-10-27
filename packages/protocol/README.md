# `@flagqai/protocol`

Versioned wire-level constants, request validation, resource projection and the
OpenAPI document shared by FlagQAI clients and the local service. It does not
own agent state. DeepSeek Harness or another registered `AgentBackend` remains
the authority for sessions, events, tools, approvals and persistence.

The contract includes session lifecycle, messages, cancellation, SSE event
replay, permission decisions, and structured-question responses. Interaction
responses are accepted only while the corresponding backend request is
pending; repeated or stale responses fail explicitly.

## In-process agent contracts

The `@flagqai/protocol/agent/*` subpaths own client-neutral session, event,
reference, presentation, channel-view and optional-capability contracts. They
have no CLI or vendor dependency. These in-process contracts can include
callbacks and capability interfaces; they are separate from the serialized
HTTP/SSE schemas above. They do not implement an agent loop or persistence.

The CLI retains compatibility re-exports and augments the `DshNative` marker
inside its DSH adapter. Native session implementation remains in that adapter
until its runtime dependencies can be extracted behind typed bindings.
