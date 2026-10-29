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

## Relationship to FlagQuantum

FlagQAI and [FlagQuantum](https://github.com/flagos-ai/FlagQuantum) are separate
repositories with different responsibilities. FlagQAI is the application and
integration layer; FlagQuantum is the Python/PyTorch quantum-computing framework.

| Component | Owns | Boundary |
| --- | --- | --- |
| FlagQAI (`apps/cli`, local packages) | Terminal UI, provider setup, local HTTP/SSE service and SDK, quantum preflight, session-event interpretation, scientific run records and narrow independent numerical validators. | Presents readiness, observed execution and numerical validation separately; forwards Agent operations to Harness. |
| DeepSeek Harness | Agent execution, tool dispatch, permissions/approvals and durable sessions. | Remains the execution/session authority; FlagQAI must not introduce a second Agent loop or independent permission authority. |
| FlagQuantum | Quantum circuit and numerical framework, simulation/training implementations and backend-specific execution. | Framework/backend support and correctness evidence belong to that repository and its declared validation scope. |
| FlagQuantum MCP integration | The tool/schema boundary used to invoke quantum capabilities from Harness. | FlagQAI selects a published MCP version and verifies the subset it uses; this is not a checkout of the engine repository. |

The runtime path is `FlagQAI -> Harness tool dispatch -> FlagQuantum MCP ->
FlagQuantum`. The [launcher profile](../apps/cli/bin/quantum-mcp-profile.js)
selects `flagquantum-mcp-server==0.3.2` and managed Python 3.12. Setup installs
that published distribution with uv; it does not clone FlagQuantum `main`.
The installed Python dependencies supply the engine. Record their resolved
versions in acceptance evidence rather than treating the MCP pin as a pin to
an arbitrary FlagQuantum Git commit.

FlagQuantum can be used directly as a Python framework without FlagQAI.
Conversely, a framework feature, accelerator result or hardware adapter does
not become available or validated in FlagQAI merely because it exists upstream.
Consult the [FlagQuantum validation scope](https://github.com/flagos-ai/FlagQuantum/blob/main/docs/reference/PUBLICATION_VALIDATION.md)
for engine evidence, and the [FlagQAI acceptance status](releases/ACCEPTANCE_STATUS.md)
for the narrower application evidence. Current FlagQAI hosted acceptance uses
local simulation and bounded two-qubit VQE, with scripted model endpoints;
it does not establish live QPU or general distributed/GPU support.

### Where changes belong

- Quantum algorithms, numerical kernels and backend implementation changes
  belong in FlagQuantum, with its own tests and release evidence.
- Terminal behavior, provider onboarding, local-service/SDK contracts, MCP
  request/result adaptation and FlagQAI evidence presentation belong here.
- Agent lifecycle, session persistence and permission-authority changes belong
  at the Harness boundary, with FlagQAI adapter compatibility checked here.
- When adopting a new quantum capability or dependency version, verify the
  released MCP schema and error behavior, record the resolved engine version,
  run deterministic input/result checks, and perform relevant installed-package
  acceptance. An upstream commit or its green CI alone does not establish the
  FlagQAI end-to-end contract. Full task-to-circuit synthesis remains a product
  direction rather than a consequence of this integration.
