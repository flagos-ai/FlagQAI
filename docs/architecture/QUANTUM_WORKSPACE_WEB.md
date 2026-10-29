# Optional quantum workspace Web client

Product decision: on 2026-10-29 the repository owner explicitly requested the quantum
workspace Web client in flagos-ai/FlagQAI. It is an optional source application, outside
the CLI release artifact. The native CLI remains supported. DeepSeek Harness continues
to own Agent execution, sessions, tools, permissions and durable session persistence.

This feature uses React components and a client-only reducer for editor, panel and circuit
selection state. It does not install another Agent loop or session database. Agent access
uses packages/sdk and the existing /v1 local-service protocol. Compute is an independent,
optional local development adapter; no QPU/GPU access or model request is enabled implicitly.

## Provenance

The user-commissioned local quantum workbench source was reviewed at local Git revision
06fc6d02489506d42a01fc52b062c0849a021da6 plus its 2026-10-29 working-tree snapshot.
The source snapshot inventory is recorded separately. Original UI/domain/backend code is
first-party task output, not copied implementation from a third-party quantum platform.
Official FlagQuantum vector branding was supplied/approved by the owner for this UI.
No portrait, animation, proprietary runtime, vendor website code or font is imported.

Reused: pure circuit layout, bounded OpenQASM diagnostics, deterministic examples, fixed
CPU adapter and vector assets. Reimplemented: React views, reducer, HTTP and Harness view
adapters. Rejected: legacy global render wrappers and a second Agent/session runtime.

## Interfaces

- Source entry: apps/web/src/main.tsx; build assets remain in apps/web/dist (ignored).
- Client state: apps/web/src/state; exact source snapshots drive program execution.
- Quantum data: versioned request/compiled-program/job contract, separate from Agent events.
- Agent: packages/sdk; server-owned session.view frames remain authoritative.
- Local computation: packages/quantum-workspace/local; fixed SSH driver, loopback only.
- Persistence: existing browser keys and optional existing SQLite path remain readable.

No credentials, local databases, generated bundles or provider identities are committed.
Migration does not run a paid model call, publish a package or deploy the application.
