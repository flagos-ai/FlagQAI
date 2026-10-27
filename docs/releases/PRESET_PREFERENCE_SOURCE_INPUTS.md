# Preset preference replacement input record

This private issue #93 batch replaces only `apps/cli/src/presetPrefs.ts`. It
does not decide the rights of its importers, the default TUI, the remaining
backend sources, or private Git history.

The replacement was designed from the caller contract in `verify-reload.ts`,
`dsh-adapter/channel/model-actions.ts`, `session-resume.ts`, and the shared
Harness agent-resolution binding: a roster ID is saved as
`agent-preset.json` under the FlagQAI data directory, reads are best effort,
and migration rewrites an old ID only while that ID remains the saved choice.
The old implementation body was not used as the design input. Node's standard
`fs` and `crypto` APIs supply same-directory exclusive temporary creation,
file synchronization, and atomic rename. A failed write preserves the previous
file; stale migration cannot overwrite another choice.

The focused reload regression covers unchanged IDs, legacy `code` migration,
custom IDs, stale migration, and rejection of control characters without
damaging a saved choice. Type checking, full CLI preflight, staged packages,
and installed acceptance are required before merging this batch. This is a
single small portion replacement, not a clean-room or rights-clearance claim
for the repository.
