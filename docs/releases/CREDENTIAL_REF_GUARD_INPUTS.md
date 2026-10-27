# Credential reference guard source inputs

This change replaces the current `credentialRefGuard.ts` body for the first-release Harness CLI. The implementation was derived from the exported settings-field contract in `adapter/ports/channel-settings.ts`, the registration and write call sites, and `verify-secret-ref-guard.tsx`. It did not use the old guard body as an implementation template.

The host reserves the `DEEPSEEK_`, `DSH_`, and `FLAGQAI_` credential namespaces. Plugin-owned settings sections lose only fields that request those references; allowed siblings keep their order. The channel write seam independently rejects a reserved reference. The guard normalizes ASCII case and surrounding whitespace before checking because Windows environment keys are case-insensitive. Rejection reports retain the original reference and field path so the registering service can explain what was dropped.

Focused regression covers registration, host-owned registration, direct writes, allowed plugin references, mixed-case and padded references, and preservation of an allowed section. This file-level replacement and its tests do not establish independent rights to other imported source, affected private history, or the complete release tree. Keep issues #86 and #93 open until their broader acceptance criteria are met.
