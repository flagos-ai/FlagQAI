# Transcript retention and replay input record

This private source-replacement batch supports issue #93. It replaces the DSH channel's transcript retention/replay module from its exported TypeScript signatures, the client-neutral `ChatRow` protocol declaration, published Harness `SessionEvent` declarations, current callers, and observable tests. The historical module body was not used as an implementation template. The implementer has previously worked in this imported repository, so this is **not** a strict clean-room claim or a source-rights clearance. A rights reviewer must still assess the resulting source, its dependencies, and the remaining imported files before any public export.

The contract is that old durable user, assistant, reasoning and tool rows release full payloads after the bounded window, while a later read restores them from the Harness session log. Local command output has no corresponding durable message and remains readable instead of being folded. A fold publishes a new immutable channel read revision; a restored row is not immediately folded again. Tool results pair by call ID even when they arrive out of order and across older/newer Harness message shapes. An error result must not be presented as a successful tool result, including when its text is empty. Goal and Todo result cards are derived only from parseable tool payloads. Legacy incremental assistant chunks are omitted from replay when a settled message for the same step exists.

Inputs and checks:

- `packages/protocol/agent/channel-view.d.mts` defines row and tool-card state. The installed `@deepseek-ai/dsh-session` declarations define event data, sequence numbers, tool errors and messages.
- `apps/cli/src/dsh-adapter/channel/emitter.ts`, `local-actions.ts`, and `backend/translate.ts` define the runtime calls and ownership boundary. The shared `#flagqai/ui-core/transcript` API supplies documented limits and preview behavior.
- `verify-message-compat.mjs`, `verify-projection-golden.ts`, and `verify-channel-ui.ts` cover cross-version call IDs, durable replay, error cards, sample session projections, folding and detached reader revisions. Full CLI preflight, package and installed checks cover integration.

The 57 historical marker paths, the other exact imported compiler inputs, the dominant terminal/composer/Chat source portions, and private Git history remain separately unresolved. Passing this batch changes neither the default TUI nor publication authorization.
