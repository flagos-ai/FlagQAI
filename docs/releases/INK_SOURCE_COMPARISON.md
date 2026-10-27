# Embedded Ink source comparison

This file records a bounded source-level check for the CLI's embedded terminal
renderer. It supplements [the release provenance audit](SOURCE_PROVENANCE_AUDIT.md)
and the Ink MIT text in `apps/cli/THIRD_PARTY_LICENSES`. It does **not** identify
an exact historical fork point or clear the entire repository for publication.
The separate [upstream provenance finding](UPSTREAM_PROVENANCE_RISK.md) is a
release blocker that this Ink overlap comparison cannot resolve.

## Pinned references

- Local FlagQAI-CLI baseline: main tree
  `88105bf350c44e2e42874dbc06f9b51ce02c31ee` (commit
  `51d52af9d6a89437502728a60ad8255570415e79`).
- Direct import: dsh-TUI v0.14.0 commit
  `c2eee95218d1decfce138f7d31ef7099cc391d00`. The embedded
  `src/ink/` files came into FlagQAI through this MIT-licensed source tree.
- Official comparison reference: [Ink v5.2.1](https://github.com/vadimdemedes/ink/tree/v5.2.1/src),
  annotated tag `f5ad0368f2201de356c029f515e9dd1a438f9548`, commit
  `991aaa54eae39e1ad6d1964e747ea936d5a4ad12`, tree
  `2a183a364013fd272fa71ceab8335a43834f79c4`. Its
  [MIT license](https://github.com/vadimdemedes/ink/blob/v5.2.1/license) has
  blob ID `5afed1256bf0c0cbd7622bae76a6c712cff1a350` and credits Vadym
  Demedes. The CLI's consolidated license file reproduces that notice.

## Method and observations

The official tag's complete Git tree was enumerated through the GitHub Git
Trees API. For each official `src/<path>` that also exists locally as
`apps/cli/src/ink/<path>`, the official file was read at the pinned tag. The
comparison removed whitespace within each nonblank line and counted distinct
line strings shared by the two files. The denominator below is the number of
distinct nonblank normalized lines in the **official** file. This deliberately
coarse measure identifies files worth attribution review; ordinary syntax and
short common lines can match by coincidence, and it cannot date a fork.

There are 29 matching paths. Of these, 27 have at least one shared normalized
line; two (`devtools.ts` and `get-max-width.ts`) have none. Stronger examples:

| Corresponding `src/` path | Shared / official unique lines | Official v5.2.1 blob |
| --- | ---: | --- |
| `parse-keypress.ts` | 125 / 205 | `db51e4f859c758bb24c18688f3ae5d482621264b` |
| `styles.ts` | 149 / 290 | `746ec098031b78993d73303681f0490e8fc5a97d` |
| `reconciler.ts` | 88 / 186 | `75a03df5ca633758b5488f59a60da2dcd84cf29f` |
| `dom.ts` | 58 / 130 | `41fe73405a62a527e9bf118b0a750a3b43be03e0` |
| `components/App.tsx` | 81 / 210 | `7ad36a6a643336f70798eac87cb69480599bb2e3` |
| `components/ErrorOverview.tsx` | 34 / 76 | `adfdf615d89681184c2973e55149f1ff4481403c` |
| `ink.tsx` | 58 / 178 | `c5098e52ebc0d05d22da1ea1e15d7c37b7d96864` |

Several larger local files contain substantially more logic than their
same-path official counterparts: for example, local `ink.tsx` has 2,180
unique normalized lines against 178 in the official file, and local
`render-node-to-output.ts` has 1,824 against 97. Same-path overlap therefore
supports an Ink-derived core in the imported renderer, but not a claim that
all local behavior is copied from v5.2.1. The 29-path set excludes local-only
modules such as `termio/`, terminal image handling, selection, and other
extensions. Their immediate import path is now checked file by file in the
[extension lineage inventory](INK_EXTENSION_LINEAGE.md); earlier authorship
and the historical fork point still require review.

A spot comparison with official Ink v4.4.1 showed shared lines in the same
core files (for example, `parse-keypress.ts` 59% of that reference's distinct
lines, versus 61% for v5.2.1). This is consistent with lineage spanning
multiple Ink revisions, but it does not establish which revision was the
original base. Do not replace the existing dsh-TUI import provenance with an
unsupported precise Ink revision.

## Reproduction and boundary

Resolve the tag and read official source with GitHub's Git Trees and Contents
APIs. Compute the unique-line overlap after removing whitespace from each
nonblank line, using the local paths above and official `src/<path>`. Git blob
IDs allow independent verification that the same official content was read.
The local baseline tree and upstream dsh-TUI commit fix the other two inputs.

The confirmed source notice remains the original Ink MIT copyright in
`apps/cli/THIRD_PARTY_LICENSES`, alongside the dsh-TUI import notice. Before
opening the repository, continue tracing earlier authorship and any other
directly copied portions, and keep the unresolved historical fork revision
explicit. No npm publication or visibility change follows from this comparison.
