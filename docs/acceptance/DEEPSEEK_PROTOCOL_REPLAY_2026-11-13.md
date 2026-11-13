# DeepSeek protocol replay compatibility

This change isolates provider protocol compatibility from the pending Web and
research-workflow changes. Native Harness execution and stored history remain
authoritative.

## Behavior

- Provider model-list configuration supplies `allowEmptySignature` for DeepSeek
  models using Anthropic Messages when neither the model nor provider explicitly
  configures it. Existing compatibility fields and explicit opt-outs survive edits.
- The headless host normalizes readable, unsigned replay metadata for the same
  DeepSeek model on trusted endpoint/credential routes before native Chat
  Completions dispatch. Signed, encrypted/redacted, malformed or foreign-model
  blocks are not rewritten. Durable source messages are not changed.
- The existing `zyapi.xmsxb.com` bridge workaround requires a separately configured
  native connection with the same endpoint root, nonempty credential reference and
  exact model ID. Routes with custom headers are not automatically substituted.
  Without a matching connection, return a protocol error before model dispatch.
- Middleware re-entry normalizes at most once before reaching the provider. Keep
  cancellation and explicit reasoning effort; return provider failures without
  retrying the request or repeating tool execution. Preserve the selected route's
  history identity on successful completion metadata.

This is a targeted compatibility adapter for the pinned Harness replay format,
not a general migration between providers or a repair of native history files.
It does not change stored credentials or auto-create a native provider profile.
The middleware is mounted by the headless host; this report does not establish
equivalent migration behavior for every interactive terminal host.

## Local checks

- Clean feature worktree based on merged PR #31 (`76d652b`). Full CLI compilation
  passed with lockfile-pinned dependencies.
- `verify:thinking-replay` uses the actual pinned Harness adapter and pi-ai
  serializers with a loopback-only fetch fixture. It reproduces the missing
  reasoning-content error, checks two tool rounds, a subsequent user turn and a
  durable JSON reload, and checks native wire `reasoning_content` serialization.
- `verify:deepseek-history` checks immutable/idempotent conversion, signed/foreign/
  malformed history, endpoint/credential/model/header restrictions, cancellation,
  preserved explicit effort, bounded re-entry and no retry on provider failure.
- `verify:provider-manager` checks shared settings, credential behavior and
  provider-level compatibility preservation. Thinking replay additionally checks
  explicit model/provider opt-out during model-list changes.
- `verify:package` checks the staged distribution. The relocated archive check
  imports compiled compatibility modules outside the repository and exercises
  provider defaults, dispatch and immutable history with network access forbidden.
- `verify:local-server-bundle` checks packaged server adapters against their
  workspace source. Headless source/type boundaries pass. The standalone headless
  type check also exposed a missing `Context.fs` augmentation on unchanged main;
  a type-only `dsh-fs` import makes the host's existing filesystem dependency
  explicit without adding a runtime service or presentation import.

The four replay/provider/relocation checks are added to the existing four-job CLI
CI matrix (Linux on Node 22/24, macOS and Windows on Node 24). The relocation check
extracts the actual archive; it does not
install or contact a model provider. No paid calls were made. Offline fixtures
validate local behavior, not the current behavior or availability of a live gateway.
