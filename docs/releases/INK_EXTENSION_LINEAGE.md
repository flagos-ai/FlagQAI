# Ink renderer extension lineage

The embedded renderer has 123 tracked paths. The README is a local provenance
note. Of the 122 source paths, 29 share a path with official Ink v5.2.1 and 93
do not. **Every one of those 122 source blobs is byte-identical to the pinned
dsh-TUI v0.14.0 import**, including all 93 local-only extensions. This proves
the immediate import path into FlagQAI without changing terminal behavior. It
does not establish who originally wrote each extension or which Ink revision
was the historical fork point.

The 93 local-only paths fall into these groups:

| Location under `apps/cli/src/ink/` | Paths |
| --- | ---: |
| Top level | 41 |
| `components/` | 11 |
| `events/` | 16 |
| `hooks/` | 12 |
| `layout/` | 4 |
| `termio/` | 9 |

To repeat the check from the repository root, download the complete Git trees
at the fixed commits and run the local classifier:

```sh
gh api 'repos/ccch1mneyyy/dsh-TUI/git/trees/c2eee95218d1decfce138f7d31ef7099cc391d00?recursive=1' > /tmp/flagqai-dsh-tree.json
gh api 'repos/vadimdemedes/ink/git/trees/991aaa54eae39e1ad6d1964e747ea936d5a4ad12?recursive=1' > /tmp/flagqai-ink-tree.json
node docs/releases/ink-extension-lineage.mjs /tmp/flagqai-dsh-tree.json /tmp/flagqai-ink-tree.json --strict
```

The script rejects changed or truncated reference trees. Strict mode fails if
any tracked renderer **source** file differs from its pinned dsh-TUI blob or
has no matching import path. The local README is reported separately. This is
a source-continuity check, not a requirement that future work never modify the
renderer: a deliberate edit needs a new review record and suitable tests.

The dsh-TUI MIT notice in `apps/cli/LICENSE`, original import record in
`apps/cli/UPSTREAM.md`, and Ink MIT copyright in
`apps/cli/THIRD_PARTY_LICENSES` remain in place. The file-level comparison to
official Ink is in [INK_SOURCE_COMPARISON.md](INK_SOURCE_COMPARISON.md).
Neither byte identity nor those notices alone clear the entire source tree
for public release.
