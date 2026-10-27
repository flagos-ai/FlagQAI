# CLI source provenance review

This is a source-repository review record for the CLI-first release. It is not
a clearance decision for making the repository public. The staged npm tarball
has a narrower file boundary than this repository, so its package check cannot
establish rights to every source file.

## Pinned source-tree comparison

The GitHub Git Trees API returned a complete (not truncated) recursive tree for
`ccch1mneyyy/dsh-TUI` commit `c2eee95218d1decfce138f7d31ef7099cc391d00`
(tree `62741b9b8b9dfab1dfb0ca28f065af140119613e`). Comparing blob IDs
against the local CLI at base tree `88105bf350c44e2e42874dbc06f9b51ce02c31ee`
plus this review branch's renderer README, after removing the `apps/cli/`
prefix, gives:

| Local CLI paths against dsh-TUI | Blob count |
| --- | ---: |
| Byte-identical at the same path | 2,342 |
| Same path, edited since import | 217 |
| New local path | 279 |

Of the 279 new paths, 209 are the materialized `vendor/dsh-std` submodule.
The remaining 70 include FlagQAI adapters, launchers, package checks, the
renamed bundled guide, and the [renderer source notice](../../apps/cli/src/ink/README.md).
The upstream dsh-TUI tree records
`vendor/dsh-std` as a gitlink to
`T-Auto/dsh-std` commit `614dfa1ac168db79fcf4577cf0ebb34e2e3b944b`.
Its complete recursive tree (`8a84be12576128a3e5405a72607b9318dd85d775`)
contains 205 files byte-identical to the vendored workspace and four edited
paths: `package.json`, `packages/command/tsdown.config.ts`,
`packages/namespace-guard/README.zh.md`, and
`packages/tool/tsdown.config.ts`. The MIT `LICENSE` at the workspace root and
the individual package licenses remain byte-identical.

The local CLI tree omits 361 upstream dsh-TUI blobs, including 279 under
`assets/`, five screenshots, and the two image-dependent ClaudeGirl source
files. All 2,992 tracked files in this review branch decode as UTF-8 and contain
no NUL byte; there are no tracked symlinks or image/font/video/archive files.
This proves the current tracked-file inventory, not the rights to every text
file or any ignored local artifact.

The candidate-tree inventory can now be regenerated on an exact committed
checkout after compiling and verifying the staged package:

```sh
node docs/releases/release-file-inventory.mjs --out /tmp/flagqai-release-file-inventory.json
```

> **Withdrawn 2026-10-27.** The independent Ink client and its separate package
> profile were removed from this repository; the CLI now ships a single
> renderer. Commands, flags, and links naming that candidate below are retained
> only as a historical record and no longer run.

Each JSON report lists every tracked Git entry with mode, blob ID and size,
and every actual staged tarball member with mode, size and SHA-256. The
`package.presentation` field distinguishes the ordinary private preview from
the independent Ink candidate. Each run checks the npm pack report against the
archive, scans both bodies for binary content,
and fails for symlinks, submodules or binary files pending separate review.
Each report records the exact Git tree ID, tarball SHA-256, and a canonical
`contentSha256` over each packaged file's path, mode, size, and content hash.
Compare `contentSha256` across operating systems: gzip/tar metadata can make
archive hashes differ even when all extracted files match. Git paths with
invalid UTF-8 are rejected rather than silently replaced in the inventory.
These are inventories of private candidates, **not** source-rights decisions
or authorization to export either tree. A clean tracked checkout is required so
the source inventory cannot silently describe a different revision from the
one being reviewed. CI retains the report as a private run artifact when jobs
actually execute.

## Independent Ink compiler-source lineage

The independent Ink package removes the inherited presentation tree from its
archive, but its Harness service still compiles CLI backend source. A pinned
blob-only audit at private main `28d95576b4ea60c5c79a5fbe6ed2423ced664763`
found **789** CLI source inputs in that compiler graph. Against the complete
`dsh-TUI` import tree above, the counts are:

| Compiler input classification | Generated Codex protocol | Other CLI source |
| --- | ---: | ---: |
| Exact blob at the same path | 525 | 114 |
| Same path with a different blob | 0 | 122 |
| Exact blob at a different path | 0 | 0 |
| No exact upstream blob | 0 | 28 |

The 525 generated protocol files have their separately pinned Apache-2.0
provenance in `apps/cli/src/backends/codex/protocol/generated/README.md`.
The 114 other exact files include backend adapters and channel logic. An exact
match proves import continuity, while a changed blob or new path does not prove
independent authorship. This check does **not** label every file as leaked or
decide whether its license permits redistribution. It shows that presentation
tree removal alone cannot clear the candidate's source or backend lineage.

After the first-release backend scope change in PR #426, private main
`e8737fbb06f1587406ad0a9e6d43fc260a7b2a3a` (tree
`4cb0f2c0b3145ae99bd52907fdaf49ccd9a5501a`) has 169 non-generated
independent-Ink CLI compiler inputs: 39 exact same-path blobs, 104 changed
same-path blobs, and 26 without an exact old blob. The import-edge screen
classifies the 39 exact inputs as 27 static, one behind a dynamic import, and
11 compiler-only. The old generated Codex protocol inputs no longer belong to
the first-release source. These counts narrow the next review; they do not
clear the current sources, notices, or private Git history.

At private main `785dfbd965f0dc2e626750cbaa6829b3d69b4305` (tree
`cecd57e4d721184855c6b7ba4df36327ca40ec23`), the same pinned screen
still has 169 non-generated compiler inputs: 37 exact same-path blobs, 106
changed same-path blobs, and 26 without an exact old blob. The exact inputs
are 25 statically reached, one behind a dynamic import, and 11 compiler-only
in the syntax-based edge screen. Compared with the 39 exact inputs above,
`dsh-adapter/channel/session-lineage.ts` and `dsh-adapter/channel/usage.ts`
have changed; that change is not evidence of independent authorship or rights
clearance. Issue #93 was closed after the first-release backend scope change;
the current-source rights gate remains open in #86. The default inherited TUI
and the proposed independent Ink presentation require separate review.

Regenerate the private, per-file report without reading any upstream
implementation bodies:

```sh
gh api 'repos/ccch1mneyyy/dsh-TUI/git/trees/c2eee95218d1decfce138f7d31ef7099cc391d00?recursive=1' > /tmp/flagqai-dsh-tree.json
node docs/releases/independent-ink-source-lineage.mjs --upstream-tree /tmp/flagqai-dsh-tree.json --out /tmp/flagqai-independent-source-lineage.json
```

The tool pins the upstream commit and refuses a truncated tree, untracked
compiler input, or dirty tracked checkout. Its scope is the candidate's CLI
TypeScript compiler inputs; it does not inspect JavaScript launchers, package
dependencies, semantic derivatives, or private Git history. Those remain in
the broader rights review for issues #86 and #93.

At private main `1f49902e8029279eb052623c5a7f6d15a9fe3359` (tree
`1657b34c402e0eae93f64e9046813293c8481076`), the same pinned metadata
screen finds **30** non-generated exact same-path CLI compiler inputs: **20**
reached by static imports and **10** type/other compiler inputs. No current
exact input is behind a dynamic import in this syntax-based screen. This
supersedes the 39/37 counts only as a newer snapshot; changed bytes do not
establish independent authorship. The private default TUI and Git history
remain unresolved.

The independent Ink preflight now also checks this count without a network
request. `docs/releases/independent-ink-source-inputs.json` stores the 169 current
non-generated compiler paths and their same-path Git blob IDs (or `null` when
the pinned public tree has no same path), with a fixed digest. The gate fails
on a new, unreviewed compiler path and if exact matches rise above the
reviewed count of 30. A decrease is a review priority,
not proof of redistribution rights; edited, renamed, semantic, dependency,
and historical portions remain outside this budget.

## Current-head inventory refresh

The initial comparison above describes its pinned historical tree. At main
commit `9520ac1e3722e407eb4a56a3c8f976abb6655316`, after unrelated source
pruning and the terminal-title fix, the repository has 2,995 tracked files.
All are UTF-8 without NUL bytes; none is a tracked symlink or binary asset.
The CLI subtree has 2,841 blobs, classified against the same pinned upstream
commit as follows:

| Current CLI classification | Blobs |
| --- | ---: |
| Same path and blob | 2,341 |
| Same path, edited | 218 |
| Relocated, exact upstream blob | 6 |
| Materialized `vendor/dsh-std` | 209 |
| New path, not an exact upstream blob | 67 |

The six exact relocations are the original README and five guide chapters.
Sixteen more `guide/flagqai-guide/` paths have same-named chapters in the
upstream `guide/dsh-tui-guide/`. A pinned-blob text comparison found thirteen
still at 0.947 or higher `SequenceMatcher` similarity; the `SKILL.md` and two
getting-started chapters were substantially rewritten (0.333, 0.100, and
0.054 respectively). These coarse ratios identify review targets, not
authorship or license clearance. Retain the upstream MIT notice on inherited
manual material. The 67 new-path category includes these chapters, FlagQAI
launchers and adapters, release checks, and notices. A new path or different
blob hash alone does not prove new authorship or source clearance.
The `vendor/dsh-std` subtree retains its separately pinned comparison above.

To repeat this inventory without cloning upstream, save the complete pinned
GitHub Git Trees response and run the local classifier:

```sh
gh api 'repos/ccch1mneyyy/dsh-TUI/git/trees/c2eee95218d1decfce138f7d31ef7099cc391d00?recursive=1' > /tmp/flagqai-dsh-tree.json
node docs/releases/source-inventory.mjs /tmp/flagqai-dsh-tree.json --paths
```

The command refuses a different or truncated upstream tree. Its path lists
make changed and new files reviewable on each candidate head. This is an
inventory, not a license decision; the unresolved reviews below still apply.

## Pinned FlagQAI extraction comparison

The CLI was extracted from private `FlagQuantum/FlagQAI` commit
`02a4d24e0dda0e9b8b28b7a1a1a826538538ee8f` (complete Git tree
`502aadaaa8a7a927b5d575a6760a4f825785588c`, 6,031 entries). The root
Apache-2.0 `LICENSE` has blob ID `261eeb9e9f8b2b4b0d119366dda99c6fd7d35c64`
in both that commit and this repository. At FlagQAI-CLI main commit
`9ccb3c209741fb866bdf4638c6c8bd589973bd79`, a second blob comparison
classifies the 68 CLI paths called `newPath` relative to dsh-TUI:

| CLI paths relative to the pinned FlagQAI extraction | Files |
| --- | ---: |
| Same path and byte-identical | 33 |
| Same path, changed after extraction | 14 |
| Path absent from the extraction | 21 |

Seventeen of the absent paths are under `guide/flagqai-guide/`: generated
copies of source chapters in `docs/` plus the guide index. The other four are
`scripts/verify-chat-terminal-title.mjs`,
`scripts/verify-installed-first-run.mjs`, `src/ink/README.md`, and
`src/screens/chatTerminalTitle.ts`. Of 155 tracked paths outside `apps/cli/`
at that main commit, 134 are byte-identical to the extraction, 14 were edited,
and seven were added in the independent repository. The comparison tool emits
the changed and absent path lists rather than assigning them authorship.

All 47 same-path CLI files in this `newPath` category have Git history in the
original FlagQAI checkout before the extraction commit. Running `git log
--follow` for each path found only `FlagQuantum
<liuwei.chem.phys@gmail.com>` in their recorded path histories, except one
`FlagQuantum <FlagQuantum@users.noreply.github.com>` entry for the copied
Apache-2.0 license file. A commit author records repository history, **not**
independent authorship of every line or clearance of an embedded third-party
portion. The upstream-derived guide chapters likewise retain the dsh-TUI MIT
notice even though their copies have new paths.

To reproduce the blob comparison at a candidate head, first generate the
dsh-TUI path inventory above with `--paths`, then run:

```sh
gh api 'repos/FlagQuantum/FlagQAI/git/trees/02a4d24e0dda0e9b8b28b7a1a1a826538538ee8f?recursive=1' > /tmp/flagqai-extraction-tree.json
node docs/releases/compare-extraction.mjs /tmp/flagqai-cli-inventory.json /tmp/flagqai-extraction-tree.json
```

The tool rejects a truncated or unexpected extraction tree and inventory for
a different local `HEAD`. It proves path and blob lineage only. It does not
resolve the original Ink fork point, Yoga port revision, ownership of external
code incorporated into the old repository, or redistribution rights for
excluded artwork. Complete those reviews before making the repository public.

The formerly bundled Yoga port at `src/native-ts/yoga-layout/index.ts` was byte-identical
to dsh-TUI v0.14.0 blob `1793cbec7e264839a4952d5dd71ec3c0af096c2b`.
The [pinned path history](YOGA_SOURCE_LINEAGE.md) traces both Yoga source files
back to the first observable public dsh-TUI commit and records the local enum
comment-only change. This fixes their immediate *import* provenance. It does
not identify which Meta Yoga revision, if any, was translated to create the
earlier TypeScript port.
The current tree uses the published `yoga-layout@3.2.1` dependency through
the adapter recorded in [the replacement inputs](YOGA_REPLACEMENT_INPUTS.md).

The initial import had a source-level exception to its binary-asset exclusion:
the 30×30 RGB portrait in `apps/cli/src/components/whaleGirlSprite.ts` was
embedded as TypeScript data. At import, its blob `1241bb06809871fbe5dcc813cacac87e4b4ccfdc`
and the `WhaleGirl.tsx` renderer blob `bf7b1e811590bbdca04bce9db5608a8c097d7f65`
were byte-identical to the pinned dsh-TUI v0.14.0 files. Their local comments
identified the inherited source and unresolved artwork claim. The portrait
source and its compiled fallback have since been removed from the current
release tree; optional local portraits still render through image protocols,
and the bundled pixel whale supplies the no-art fallback. The upstream MIT
`LICENSE` blob `5a7e549dc5458fb1621fe8b5419a2581671baf89` is also
byte-identical to `apps/cli/LICENSE`. The [upstream introduction commit](https://github.com/ccch1mneyyy/dsh-TUI/commit/bbca5527b3998f10169c65aabb329637369ecd46)
adds both source files alongside three PNGs and records Chimney as commit
author. The old source header claimed the pixel design was original to that
project; the commit record and self-description establish immediate lineage,
not independent proof of the underlying artwork rights. The PNGs are excluded
and the current CLI package excludes the sprite, but the old blob remains in
the private repository's Git history. A public source export must still
account for that history.

| Source family | Current evidence and notice | Distribution boundary |
| --- | --- | --- |
| dsh-TUI 0.14.0 | Exact import commit and path history in `apps/cli/UPSTREAM.md`; original MIT text in `apps/cli/LICENSE`. | Source-derived CLI and compiled terminal runtime. |
| dsh-std | Import commit in `apps/cli/UPSTREAM.md`; MIT texts in the vendored workspace and packages. | Vendored source and bundled workspace packages. |
| TUI profile contracts | MIT text in `apps/cli/tui-profile/LICENSE`. | Profile source; selected registry and schema files ship. |
| Pixel whale and dsh-anchored-standard | BSD-3-Clause and MIT attribution in `apps/cli/THIRD_PARTY_LICENSES`. | Relevant terminal implementation ships; portrait PNG and animation binaries do not. |
| Embedded portrait sprite | Exact dsh-TUI source blobs, introduction commit, and original MIT license are pinned above. The upstream header claims original artwork, but that claim has not been independently verified. | Removed from the current source and package; the old blob remains in private Git history and must be reviewed before opening that history. |
| Pi TUI LaTeX parser | Source snapshot and local adaptation in `apps/cli/src/terminal-utils/latex.ts`; original MIT header there and in `apps/cli/THIRD_PARTY_LICENSES`. | Compiled LaTeX parser ships. |
| Pi nano-context and TPS-meter UI | `apps/cli/src/screens/StatusMetrics.ts` identifies both ports in its source comment. The MIT notices for Sergey Golovin and Venkata Sai Chirasani are now in `apps/cli/THIRD_PARTY_LICENSES`; upstream package versions `pi-nano-context@0.1.1` and `pi-tps-meter@3.0.4` confirm current metadata and license text. | Compiled status metrics ship; the precise historical revision used by dsh-TUI remains unverified. |
| Pi working-activity UI | `apps/cli/src/components/ActivityPicker.tsx` and the related activity views identify the Pi extension as an interaction reference. The upstream MIT notice from `ccch1mneyyy/working-activity` is now in `apps/cli/THIRD_PARTY_LICENSES`. | Compiled activity UI ships; the exact historical port boundary remains unverified. |
| Codex CLI effort animation | `apps/cli/src/trajectory/effortIgnition.ts` names `openai/codex` PR #34365; the merged PR introduced `effort_ignition.rs` and `effort_ignition_styles.rs` at commit `f944456d81f32cadd96d037c190d7ce65a956306`. The upstream Apache-2.0 text is included in `apps/cli/LICENSES/FlagQAI-Apache-2.0.txt`, and the source reference is recorded in `apps/cli/THIRD_PARTY_LICENSES`. | Compiled color-wave logic ships; precise copied-line scope remains for source review. |
| cross-spawn 7.x escaping | Direct-source markers in `apps/cli/src/utils/shellQuote.ts` and `apps/cli/scripts/dev-command.mjs`; original MIT text in `apps/cli/THIRD_PARTY_LICENSES`. | Compiled escaping helper ships; build helper remains in source. |
| Yoga layout and enums | [Pinned history of the removed port](YOGA_SOURCE_LINEAGE.md), [official dependency inputs](YOGA_REPLACEMENT_INPUTS.md), and upstream MIT text in `apps/cli/THIRD_PARTY_LICENSES`. The old 16 enum sets matched official Yoga v3.2.1 generated source at commit `042f5013152eb81c1552dec945b88f7b95ca350f`; `LogLevel` and `NodeType` were omitted. | The published `yoga-layout@3.2.1` dependency supplies current layout; the historical port does not ship. The old port's exact Meta Yoga revision remains unknown, and the remaining renderer still needs source-rights review. |
| Embedded Ink renderer | [Pinned file-level comparison](INK_SOURCE_COMPARISON.md) finds 29 same-path files against official Ink v5.2.1, with substantial shared source lines in `parse-keypress.ts`, `styles.ts`, `reconciler.ts`, and others. The [extension inventory](INK_EXTENSION_LINEAGE.md) finds all 122 renderer source files, including 93 without same-path official Ink files, byte-identical to the pinned dsh-TUI import. The official Ink MIT license carries Vadym Demedes's copyright; its text is in `apps/cli/THIRD_PARTY_LICENSES`. A separate [upstream provenance finding](UPSTREAM_PROVENANCE_RISK.md) records an older dsh-TUI audit that self-reported ports from leaked source. | Compiled terminal renderer ships. Its direct import lineage is established, but MIT notices and a matching import are insufficient to clear the reported portions. Public release is blocked by issue #93. |
| MathJax and mhchemParser | Source-build attribution, versions, and Apache-2.0 text in `apps/cli/vendor/mathjax-tex-svg/NOTICE` and `LICENSE`. | The bundled `@dsh-tui-vendor/mathjax-tex-svg` package ships its compiled output, `LICENSE`, `NOTICE`, and generated `lib/index.mjs.LEGAL.txt`; the repository also retains its build source. |
| Generated Codex protocol types | The official `openai/codex` tag `rust-v0.160.1` targets commit `d27764b82f7118f674371e6d6e76271d9d606edb` and carries Apache-2.0. Regenerating with published `@openai/codex@0.160.1` produced the same 875-file digest as the committed tree; the command and digest are in `apps/cli/src/backends/codex/protocol/generated/README.md`. | Source repository only; `verify:package` excludes generated declarations and runtime stubs from the npm tarball. |
| CLI test fixtures | [Pinned fixture lineage](FIXTURE_SOURCE_LINEAGE.md) compares all 12 remaining tracked fixtures byte-for-byte against the dsh-TUI import and FlagQAI extraction; the offline verifier guards that exact inventory. The inventory covered 86 before the deferred backend removal. | Source repository only; the staged npm package excludes `scripts/fixtures/`. Source continuity and a basic redaction screen do not independently clear fixture contents or upstream authorship. |
| FlagQAI-authored additions | Repository Apache-2.0 text and CLI copy in `apps/cli/LICENSES/FlagQAI-Apache-2.0.txt`. | Repository and compiled CLI additions, subject to individual file notices. |

The staged CLI package currently bundles eight workspace dependencies: seven
`@dsh-std/*` packages under MIT and
`@dsh-tui-vendor/mathjax-tex-svg` under Apache-2.0. The staged-package check
now requires their exact reviewed names and license metadata, compares every
bundled `LICENSE` (plus MathJax `NOTICE` and generated
`lib/index.mjs.LEGAL.txt`) byte-for-byte against the corresponding source or
build output, and rejects absent notices. This protects the **bundled**
dependency notices during future packaging changes. It does not review the
separately installed registry dependencies or establish clearance for every
source file in the repository.

The Pi, cross-spawn, Yoga, and Ink MIT texts were checked against their upstream
license files when added to the consolidated CLI notice. Their source markers
identify the copied or ported paths. `apps/cli/OPEN_SOURCE_NOTICES.md` and the
root `THIRD_PARTY_NOTICES.md` point users to the consolidated text.

For the Yoga enum reference, the official
`javascript/src/generated/YGEnums.ts` at tag `v3.2.1` has SHA-256
`bc7ef97509d5572e0a2db12e14a830c5da5d916c17d09977c7d257f6144b650b`.
All 16 local enum member names and numeric values match that file; the upstream
`LogLevel` and `NodeType` enums are not part of the local port. This comparison
establishes a reproducible compatibility reference, not the historical source
revision for the 3,000-line layout implementation.

The Codex protocol comparison used an isolated temporary install of
`@openai/codex@0.160.1` (npm integrity
`sha512-f1yrJhwgimKQI1kYQlxdPJcFwkNZxZrbz7Hf89EAcnLqkQ7TiESzr2FgSZn13Ga5RuHjlVUfurzwq10wk9zw2g==`)
and an empty `CODEX_HOME`. Running `codex app-server generate-ts --experimental
--out <temporary directory>` produced 875 files with digest
`sha256:3843848c108242f7364b986c80fefd6cd37aec4ab2863b0e2b6fb7bc86feb6f7`,
identical to the committed generated tree under the repository's
`scripts/lib/codex-protocol-digest.mjs` algorithm. No model endpoint was called.

## Work still required before opening the repository

The current CLI tree also omits six source modules that had no production
imports or package subpath exports: `ToolUseLoader`, `Byline`,
`SessionPreview`, `WorkspaceListRow`, `use-tab-status`, and `use-interval`.
The first two appeared in the historical dsh-TUI marker inventory but were
only imported by tests for those retired components; the tests now exercise
the still-active thinking selector and message metadata. Active tool-card and
status-line behavior remains covered by separate renderer regressions. This
reduces current source and staged-package surface only. It does not clear the
remaining historical candidates, semantic lineage, or private Git history.

Track the source-rights release gate in
issue #86 (recorded in the maintainers' issue tracker).

1. Audit all remaining imported source, other generated material,
   fonts, and non-package files against their origin.
2. Continue the [file-level Ink review](INK_SOURCE_COMPARISON.md), especially
   the earlier authorship of [local-only extensions](INK_EXTENSION_LINEAGE.md),
   and trace the broader Yoga layout port where possible. The pinned dsh-TUI
   blobs prove the immediate import into FlagQAI; same-path Ink overlap does
   not prove the original fork revision, and the original Meta Yoga revision
   remains unknown. Resolve the [upstream leaked-source provenance finding](UPSTREAM_PROVENANCE_RISK.md)
   before any public release; it is more specific than an unknown fork point.
3. Confirm source-repository notices and package notices cover every directly
   included third-party portion, including later upstream syncs. Re-run the
   staged-package inventory after any source or build change.
4. Keep the excluded portrait/animation binaries and native Desktop source
   out until their separate rights are established. Review the embedded
   portrait sprite's underlying artwork claim before opening the source
   repository; do not infer rights from a passing package test.

No npm publication or repository visibility change follows from this record.
