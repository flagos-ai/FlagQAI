# Runtime Readiness and MCP Preparation Application Interfaces

`createRuntimeReadinessReader({ observer })` produces a bounded, passive snapshot
of the already mounted Harness Agent scopes and Model/Skill/Tool registries. It
owns de-duplication, sorting, timeout/error isolation and minimal JSON projections,
not another runtime state machine. The native observer and Cordis scope stay in
`runtime/flagqai/web-capabilities/runtime-readiness.mjs`.

Registry states are `observed`, `incomplete`, `not_observed` and `failed`.
An unmounted preset is not a fault. Observation cannot prove model endpoint,
MCP transport, quantum hardware or downstream API reachability. A local Skill
snapshot may discover directories/frontmatter, but does not return Skill bodies,
paths or Provider locators. The passive reader never invokes standing preset
mounting, starts an MCP server, executes a Tool, reads secret values or repairs
configuration.

Snapshot version 1.4 compares required Skill/Tool identifiers from authoritative
capability policy with one complete preset generation. Conditional/opt-in
components count as declarations, not requirements. Multiple generations,
missing required identifiers and incomplete reads retain their appropriate
incomplete/error states. Missing identifiers are reported only after a complete
Registry read. Diagnostic `nextActions` are fixed suggestions, never commands.

Heavyweight MCP lifecycle states are `disabled`, `preparing`, `ready`, `failed`
and `action_required`. Ready requires the declared fixed Tool contract, not an
enabled flag or local file. An optional MCP failure does not downgrade base
Registry observation. Catalog policy is the single source for pinned probe,
disk-space budgets; capability contracts own Tool identities/effects.

`mcp-preparation.mjs` separately owns explicit prepare/cancel/retry/snapshot
commands, single-flight transitions, disk preflight, bounded diagnostics and
cancellation. The FlagQuantum adapter runs only the pinned
`flagquantum-mcp-server==0.3.2` probe and checks all 17 declared Tools. Preparation
success does not mean those Tools are registered in a live session.

Activation delegates to Project Settings and atomically publishes the resulting
preset into `$DSH_HOME/.agent-presets/flagqai/agent.cordis.yml`. Native Harness
composition-stamp handling creates a new standing generation for future sessions;
existing sessions keep their generation. There is no hot insertion into a turn.
Ready requires full contract observation in the new generation.

Metadata is private under `$DSH_HOME/flagqai/mcp-preparation/`; dependency cache
stays in native uv cache or administrator-selected `UV_CACHE_DIR`, not the
workspace, Git or a Session log. Large setup requires explicit loopback-only
browser intent. Bounded metrics expose attempt count, terminal duration/status
and activation outcome, never prompts, source, credentials, scientific input,
Tool arguments or diagnostic bodies. The local preparation adapter uses the
canonical scientific-core process executor.

```text
Host route -> passive Registry reader -> injected native observer
Host route -> MCP preparation application -> pinned process + private metadata
           -> Settings activation -> atomic native preset publication
```

These application interfaces are retained as source scaffolding; the CLI-first
package does not import or ship them. The removed image-prewarm shortcut was not
part of the local CLI preparation path.
Historical `src/readiness/server` imports are compatibility exports only.
