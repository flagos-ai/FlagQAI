# Source provenance

FlagQAI CLI began from the source code of
[ccch1mneyyy/dsh-TUI](https://github.com/ccch1mneyyy/dsh-TUI), imported at:

- release: `v0.14.0`
- commit: `c2eee95218d1decfce138f7d31ef7099cc391d00`
- imported: 2026-10-10
- upstream license: MIT

The vendored `dsh-std` workspace was imported from the upstream submodule
[T-Auto/dsh-std](https://github.com/T-Auto/dsh-std) at commit
`614dfa1ac168db79fcf4577cf0ebb34e2e3b944b` and retains its own MIT
license and copyright notices.

The import contains the source, build scripts, regression checks, terminal art
defined in source, profiles, and vendored workspaces required to reproduce the
application. No portrait, animation-frame, font, or screenshot binaries were
imported into this repository. The import initially included a 30×30 RGB
portrait sprite in `src/components/whaleGirlSprite.ts`; it was later removed
from the current source and CLI package pending rights review. The historical
blob remains in private Git history. Its exact provenance and the distinction
from the omitted source PNGs are recorded in
`../../docs/releases/SOURCE_PROVENANCE_AUDIT.md`.
Git metadata, upstream CI configuration, repository-only agent files,
promotional screenshots, and community governance files were excluded.

## Independence rule

FlagQAI must not depend on `@deepseek-harness-tui/dsh-tui` at runtime and must
not patch an installed copy in `node_modules`. Product changes are made in this
directory. DeepSeek Harness remains an explicit runtime dependency while the
shared FlagQAI service boundary is developed.

Future upstream synchronization must be explicit. Record the old and new
commits, review the diff, retain all applicable notices, and make a normal
FlagQAI commit. Do not replace this directory with a moving submodule.

## Attribution

The upstream MIT license is preserved in this directory as `LICENSE` and is
referenced by the repository-level `THIRD_PARTY_NOTICES.md`. FlagQAI modifications are
distributed under the repository's Apache-2.0 license to the extent permitted,
while upstream portions remain subject to their original notices.
