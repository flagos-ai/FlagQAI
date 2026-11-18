# Research coordinator admission adapter

This PR extracts the Harness-independent dispatch/recovery adapter from the
original worktree. It consumes the durable research metadata contract introduced
in PR #103. Concrete Cordis service binding, native workbench tool registration,
and browser controls remain separate integrations.

## Behavior

- Native admission starts only after the metadata service grants a durable claim.
  Concurrent calls share the pending admission, while reconstructed adapters must
  obtain a fresh claim and cannot reuse an earlier grant.
- Worker requests carry the archived source and verifier identities, baseline
  revision, and recorded constraints. The adapter does not generate or execute
  research code, validate results, or adopt a candidate.
- An uncertain admission or child identity mismatch is never automatically
  retried. Cancellation after claiming also leaves admission unresolved instead
  of authorizing a second start.
- Recovery only observes existing non-reserved worker identities and projects
  their saved status with stable receipt IDs. It never calls native admission.
- Harness retains ownership of child execution and parent delivery. Completion
  projection is attached before the running acknowledgement, so a lost running
  receipt does not prevent a subsequent completion from being recorded.

## Verification

Eight focused tests pass for concurrency, two independent worker tasks,
code/verifier/constraint propagation, uncertain admission after reconstruction,
foreign ownership, missing capabilities, cancellation, identity mismatch,
read-only recovery, and completion after a lost running receipt.

The same eight tests run from a CLI archive extracted into a fresh temporary
directory with no repository module imports, dependency installation, provider
credentials, network requests, or model calls. The installed test selects the
adapter inside the extracted package rather than the checkout. The source and
relocated acceptance scripts are included in the existing CLI CI job; runner
selection and required check names remain unchanged.

The scenarios use controlled callbacks at the native service boundary. They
verify admission and recovery control flow, not real Harness sessions or
scientific result quality. Those need acceptance with the subsequent concrete
native binding.

CLI type checking and staged package verification also pass. Original worktree
changes, editor/chat drafts, research products, and running services are retained.
