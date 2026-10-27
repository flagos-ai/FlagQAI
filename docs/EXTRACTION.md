# Extraction record

The private FlagQAI-CLI repository was initialized from FlagQAI commit
`02a4d24e0dda0e9b8b28b7a1a1a826538538ee8f` on 2026-10-12.

## Imported source

- `apps/cli`: CLI source, terminal renderer, commands, profiles, build and
  regression scripts, vendored dsh-std/MathJax sources, and upstream notices.
- `packages/harness-adapter`, `protocol`, `server`, `sdk`, and `ui-core`: the
  local Harness-backed service and CLI attachment dependency closure.
- `packages/scientific-core/execution`: the bounded local process executor.

The CLI staging script copies only these repository-owned packages into the
installable tarball. Independent installation, source compilation, staged
package checks and clean installed-package acceptance were performed from the
new checkout, with no links to the original repository.

## Deliberate exclusions

- Web and native Desktop implementations; only README placeholders remain.
- Hosted Cloud implementation and migration code.
- Optional portrait PNGs and animation-frame binaries with unresolved
  redistribution rights. The embedded RGB portrait sprite in CLI source was
  imported and remains a separate source-rights review item.
- Original Git metadata, generated `lib` output, dependencies and local state.

## Source-of-truth transition

This repository owns new CLI changes. The original monorepo retains its
pre-extraction CLI tree for compatibility with existing Web/Desktop and local
scripts. There is no bidirectional sync. A separate, tested integration change
must explicitly update those consumers before the old copy can be removed.
Do not copy changes between repositories by hand without recording the source
commit, reviewing the diff and preserving applicable notices.

The extraction does not publish an npm package. That decision remains gated
by `docs/releases/CLI_FIRST_RELEASE.md`.
