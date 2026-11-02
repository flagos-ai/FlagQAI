# Editor and project workflow

This change keeps the existing workbench layout and native execution ownership.
It covers local editing, model import and navigating project files. Circuit
rendering, Jobs presentation, native Agent tools and remote execution are
separate changes.

## Editing and recovery

- Find in code supports literal Unicode text, case sensitivity, cyclic match
  navigation and selected-text seeding. Highlighting preserves source bytes and
  syntax colors. Typing while find is open does not steal the editor caret.
- Tab and Shift+Tab indent and dedent selections while retaining selection
  direction and scroll position. Save shortcuts ignore composition, extra
  modifiers and key repeats; a pending save cannot be submitted twice.
- Diagnostic navigation measures actual rendered glyph positions, including
  tabs and Unicode, to reveal the relevant source column.
- Closing a dirty file retains its draft. The Drafts control can reopen cached
  drafts and incoming Agent proposals without requiring a successful disk read.
  Existing persistence remains authoritative; this does not add backup import.

## Project navigation

Quick Open keeps a newer dialog alive when an earlier read completes. Shared
operation locks prevent conflicting opens and explain waiting. Failed reads
identify the attempted path and provide retry while preserving cached source.
Queries announce their total match count and explain the forty-item display
limit. Query changes clear the previous attempt's local error presentation.

Project tree search trims whitespace, ignores case and supports clearing by
button or Escape. It temporarily reveals matching folders without changing
saved folds. IME cancellation preserves the query.

New-file submission is single-flight, fixes the submitted name while pending,
and retains that name after failure. Existing files are protected by the
server's conflict checks. Cancellation restores focus to the trigger. Switching
projects clears the pending filename and filter.

Project chooser completions and errors are scoped to their submitted input.
Closing, reopening or editing a path invalidates the old presentation. The
control distinguishes opening, creating and waiting. Closing the chooser does
not cancel an already accepted server operation.

## Import and templates

Source imports validate extension, size, readable UTF-8 text, empty input and
binary content. Python/OpenQASM source remains limited to 32 KiB and `.fqx` to
16 MiB. An asynchronous read cannot discard a newer editor draft. Import errors
have one dismissible presentation.

Model search has a clear control and useful empty state. Local template input
invalidates the previous preview when edited; unsupported input explains the
supported templates. Previews use the shared syntax-highlighted code component.

## Verification

Run the complete existing product acceptance lane documented in
[WEB_PRODUCT_ACCEPTANCE.md](WEB_PRODUCT_ACCEPTANCE.md), using the SDK revision
pinned in CI. This PR adds the import journey to the machine-readable contract
and extends the workspace continuity case with failure injection, delayed file
and folder responses, IME, keyboard shortcuts and draft recovery.

Browser services use isolated workspaces and scripted Agent output with actual
CPU SDK execution. They do not call a paid model or modify the user's live
workspace. Passing automation does not certify live-model quality, large-scale
performance, independent usability trials or complete backup restoration.
