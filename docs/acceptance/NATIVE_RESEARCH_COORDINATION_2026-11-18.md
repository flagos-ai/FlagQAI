# Native research coordinator binding

This change binds the durable coordination adapter to public Harness activation,
child catalog, and session persistence services. Native Harness owns execution,
permissions, model invocation, and parent delivery. No alternate agent loop or
session store is introduced.

## Integrated path

Workbench-bound sessions lazily register `workbench_research_team`. Research
source inspection uses `workbench_inspect` with `resource=research` and an archived
run ID. Team operations retain the captured workbench/session binding. The local
bridge derives the coordinator owner from its verified active session, never a
caller-selected owner. It records metadata but cannot dispatch native workers.

Dispatch calls the Harness `spawn` activation provider with the previously
reserved child ID and parent delivery. If the required native services are
missing, dispatch and recovery reject rather than simulate execution. Recovery
queries the parent's child catalog and reads the child's public persistent log.
It checks both child and parent identities, observes live work without rerunning
it, and reports unresolved or interrupted admission explicitly. When JSONL omits
an event count, bounded probes locate the tail before reading at most 200 events.
Read handles close even when ownership validation fails.

Constraint recommendation, human confirmation of revised task versions, and
browser team controls remain later PRs. Existing baseline and candidate review
flows are unchanged.

## Acceptance

- Seventeen JavaScript tests pass across scoped workbench tools and native
  service binding, including foreign persisted children, live workers,
  interrupted/unknown admission, bounded JSONL probes, and parent delivery.
- Eleven coordination/bridge tests pass; full pinned SDK acceptance passes all
  190 tests without failures or skips.
- A real Harness 0.2.1-rc.2 composition uses the agent loop, spawn provider,
  child catalog, session query, and JSONL persistence with a local fixed-response
  LLM adapter. Two workers receive reserved identities and version-bound tasks.
  One completion metadata receipt is deliberately lost. After reopening both the
  native runtime and metadata service, recovery finds that completion in the
  native log and retains evidence, with zero new requests and no duplicate
  workers. Stale-constraint evidence is rejected and fixture drafts stay intact.
- The same real-session acceptance runs against a CLI archive extracted outside
  the checkout. Its compiled binding and workbench tools come from the extracted
  package; a separate pinned test-only runtime provides public Harness peers.
- The default CI acceptance setup installs that test-only runtime in a fresh
  temporary directory using exact prerelease versions and disabled lifecycle
  scripts. Cordis 4.0.5 satisfies the testkit composition's declared peer range.
  Both source and extracted-package tests use local responses exclusively.
- CLI source compilation, type checking, binding lifecycle regression, and staged
  package verification pass (2,671 files; 32 entry targets).

The verifier reports in the native lifecycle fixture are synthetic. This proves
native lifecycle and metadata integration, not scientific correctness or an
agent's autonomous research ability. No paid models are called. Original
worktree state and all 16 protected draft/research product checksums are unchanged;
existing local Web and Agent services are not restarted.
