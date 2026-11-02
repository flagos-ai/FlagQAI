# Backup draft recovery

The Backups control downloads the existing workspace JSON format and previews
code recovery from that format. Recovery adds detached models as one reducer
action; it does not select a model or replace the active editor, project tabs,
file links, undo history, execution selection or Agent session.

The importer validates the schema and every included code buffer before offering
recovery. It accepts at most 16 MiB, 128 distinct drafts and one MiB of source
characters per draft. Malformed lists, invalid languages, binary source and
unsupported versions reject the whole import. No imported code is executed.
Only explicit name/source/language fields enter the recovered models; paths,
editor links and run identifiers from the input are not activated.

Active code, saved models, language drafts, project tabs and scratch code are
included. Unresolved incoming Agent code becomes a separate draft. Identical
source in the same language is deduplicated, including repeated imports. Name
conflicts receive a Restored suffix, preserving the existing model. Selection
and a bounded source preview precede confirmation. Pending reads are invalidated
when the dialog closes or a new read starts.

This is code-draft recovery, not full workspace or machine migration. SDK
experiments still use `.fqx` import. Program layout, disk files, conversation
history and execution archives are not reconstructed from this JSON. The full
backup-import product gate remains open until those broader recovery boundaries
are explicitly designed and verified.

Tests cover a real exported backup, pending proposals, immutable active state,
duplicate and conflicting models, invalid input, refresh durability, and an
actual browser download/preview/recovery with no new Python executions.
