# File-mention parser replacement inputs

The CLI's `@file` parser is used by both the terminal composer and the
Harness-backed attachment adapter. The previous `src/utils/mentions.ts` blob
was byte-identical to the historical dsh-TUI import. This change replaces its
body with a scanner written from the visible call-site contract and the
existing `verify-file-suggestions` and `verify-mention-lines` behavior checks.

The contract covers whitespace-bounded `@` triggers, quoted paths, Windows
separators, source offsets for completion, deduplication, and optional positive
`#Lstart-end` ranges. Malformed or inverted ranges remain literal filenames.
For a closed quoted path, only a valid range extends the token; adjacent
punctuation or a malformed suffix remains outside it. The replacement keeps
those externally observed behaviors while explicitly checking quoted-range
completion and email text that must not trigger a file reference. No
historical parser implementation body was used as a template; the closed-quote
edge was checked against the prior runtime as a black-box behavior probe.

This is one bounded source replacement, not a rights clearance for the
remaining terminal implementation or the repository's private Git history.
