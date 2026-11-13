# Resume model route acceptance — 2026-11-13

A persisted session interrupted before its first model request has no recorded
provider/model pair. Passing undefined options to native resume left consumers
without a complete route. Returning a second live-history lookup also left the
client route empty until another request was recorded.

The resolver now selects one complete pair: an explicit override, otherwise the
session's recorded route, otherwise the validated startup route. That same pair
is supplied to native resume and returned to the client. Half-configured overrides
never mix with another source. Existing mounted agents are reused as before.
Native Harness retains session admission, persistence and execution ownership.

## Local validation

```sh
node --test apps/cli/scripts/agent-resolution.test.mjs
npm --prefix apps/cli run compile
node --test apps/cli/scripts/package-boundary.test.mjs apps/cli/scripts/bundled-notices.test.mjs
npm --prefix apps/cli run verify:session-mounts
npm --prefix apps/cli run verify:package
npm --prefix apps/cli run verify:installed-agent-resolution
```

- Seven resolver tests passed against source and the relocated CLI archive.
- The unchanged main resolver failed five of those seven assertions, including
  missing initial routes and missing client-facing resumed routes.
- Cases cover no prior request, a recorded pair, a complete override, a half pin,
  validated fallback selection, validation failure and a mounted session.
- Validation failure abandons and settles the mount reservation without resuming
  or creating a replacement session.
- CLI compilation, twelve package-boundary/notice tests and existing session
  mount-ledger checks passed.
- Staged package verification passed: 2,666 files and 32 entry targets.
- Both resolver suites are included in the existing CLI CI matrix.

The relocated acceptance extracts the actual staged archive to a temporary
directory and imports its packaged resolver. Native lifecycle and model-catalog
bindings are deterministic fixtures; this is adapter/distribution acceptance,
not a live-model, process-crash or scientific-quality evaluation. No model or
quantum calculation is submitted. Original Web services, drafts and research
artifacts are outside this isolated PR worktree and were not modified by this work.
