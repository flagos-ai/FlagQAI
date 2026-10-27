# Reference expansion replacement inputs

The independent Ink compiler graph previously contained two byte-identical
historical dsh-TUI inputs for `@file` and composer-image expansion. Both entry
points now call one attachment expansion policy. This removes duplicate
parsing, file reads, image admission and size-budget logic; the service and
Harness session still own delivery and persistence.

The behavior contract came from the existing `verify-mention-lines` and
`verify-clipboard-image` tests, the `MentionFs` and attachment port types,
caller-visible warnings, and 800 deterministic black-box comparisons of the
previous and replacement entry points. It covers source-order image limits,
line-range and literal-filename fallback, capped text and shallow directory
attachments, and best-effort missing references. The replacement was
structured as one ordered reference pass with separate reference collection,
path resolution, and text selection. The historical implementation body was
not used as a template; prior access to it means this is not a strict
clean-room provenance claim.

This change narrows the exact-blob compiler inventory but does not clear the
remaining imported terminal host, other compiler inputs, rights review, or
private Git history. It is not authorization to publish source or npm.
