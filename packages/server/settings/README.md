# Project Settings Application Interface

This Server application owns project-level Skill loading policy, MCP connection
configuration and credential references. Browser/Host routes submit intent;
`executeProjectSettingsCommand` owns validation, revision checks, controlled
paths, setup/credential gates and atomic writes. Runtime readiness is a separate
passive projection in `../readiness`, not inferred from enabled configuration.

All writes share the Harness `withFileLock` project lock at
`agent.cordis.yml.lock`. Commands re-read the current revision inside the lock;
stale same-process or cross-process requests raise `ProjectSettingsConflictError`
(HTTP 409). The caller must refresh before retrying. Skill removal shares that
lock rather than deleting a directory containing its own lock. Abandoned locks
are not automatically stolen; establish that their owner has stopped first.

`project-settings-catalog.mjs` owns read-only integration metadata, pinned
versions, setup and credential descriptions. `capability-package-catalog.mjs`
projects the authoritative `.agents/capability-packages.yml` into bounded L0–L3
summaries and Registry-comparison identifiers; it exposes neither file paths,
audit commands nor secrets, and performs no installation/audit. Integration
source descriptors are shared by setup scripts; they do not write configuration.

```text
Harness Settings UI -> bounded Host route
  -> executeProjectSettingsCommand
     -> read-only catalog and capability policy
     -> canonical and compatible project Skill roots
     -> runtime/flagqai/agent-presets/flagqai/agent.cordis.yml
```

Credential values remain in the native Harness credential store; project files
hold reference names only. New behaviors must extend this application and its
regressions rather than duplicate YAML/path/setup/concurrency rules in a route
or renderer. Current policy paths are preserved; this migration does not move
configuration into a new Harness user-settings namespace.

Run `tests/project-settings.test.mjs`, `tests/project-settings-concurrency.test.mjs`
and `tests/harness-web-capabilities.test.mjs`. Historical `src/settings/server`
imports are compatibility exports only; production consumers use this directory.
