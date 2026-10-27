# CLI-first architecture

```text
FlagQAI CLI ──────┐
                  ├── Harness adapter ── DeepSeek Harness Agent/session runtime
Headless service ─┘
        │
        ├── Protocol and SDK ── remote terminal attach
        ├── UI core ── session projections
        └── Scientific executor ── bounded local tool processes
```

The CLI owns terminal presentation and provider setup. Harness owns Agent
execution, durable sessions, tool registration and approvals. The local
service exposes those capabilities without establishing another Agent loop.
Future Web and Desktop clients may consume the same protocol; their source is
not part of this CLI-first repository.

The independent build must not read files from the former FlagQAI monorepo.
`apps/cli/scripts/sync-local-server.mjs` copies only the reviewed local
packages into the staged CLI package. The public tarball boundary is enforced
by `apps/cli/scripts/package-boundary.mjs`.
