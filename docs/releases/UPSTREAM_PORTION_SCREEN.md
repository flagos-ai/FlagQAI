# Historical source portion screen

## Current release-blocker snapshot at main `c2fd41dfe8db4032580f4e2e937ba5afb76c5f0d`

The pinned-reference screen was rerun on this exact main commit after the
permission-scope replacement. Of 57 historical candidates, **none is
byte-identical at its old path**; 46 remain modified at the same path and 11
are absent at the old path. The line-level screen still finds **14,919 current
lines** in exact contiguous blocks of at least five lines. Four terminal files
account for **14,640 lines (98.1%)** of that total:

| Current source under `apps/cli/` | Exact lines in blocks of 5+ | Current lines | Longest exact block |
| --- | ---: | ---: | ---: |
| `src/screens/Chat.tsx` | 6,886 | 6,946 | 1,517 |
| `src/components/PromptInput.tsx` | 4,502 | 4,512 | 3,313 |
| `src/ink/ink.tsx` | 2,699 | 2,884 | 724 |
| `src/ink/components/App.tsx` | 553 | 660 | 221 |

The zero byte-identical **file** count must not be read as source-rights
clearance: the conversation, composer, and terminal host still contain large
exact portions. The remaining modified files, renamed paths, semantic
derivatives, helper modules, and private Git history require their own rights
or independently sourced replacement review. The full current-tree terminal
boundary remains the release priority, rather than another small-leaf batch.
To reproduce this snapshot after main moves, pass
`--ref c2fd41dfe8db4032580f4e2e937ba5afb76c5f0d` to the screen command
below. This is a continuity measurement, not an authorship or legal verdict.

## Earlier baselines

This report prioritizes the unresolved source-rights review in issue #93 (recorded in the maintainers' issue tracker). It compares the 57 historical candidate paths from the pinned dsh-TUI audit with FlagQAI-CLI main `683e5ac5fc11becdb1d6ab7d38f20db186d49dd8`. The reference is the fixed dsh-TUI import commit `c2eee95218d1decfce138f7d31ef7099cc391d00`.

The comparison found 48 candidates still present at the same path: two byte-identical and 46 modified. Nine old paths are absent and require separate mapping. For each present file, the screen counts lines in non-overlapping **exact contiguous blocks of at least five lines**, with whitespace and comments retained. It verifies the reference bytes against the pinned upstream Git blob and the local bytes against the selected Git commit before reporting. A modified file can still contain nearly its entire imported implementation:

| Current source path under `apps/cli/` | Exact lines in blocks of 5+ | Longest block | Current lines |
| --- | ---: | ---: | ---: |
| `src/screens/Chat.tsx` | 6,920 | 4,818 | 6,928 |
| `src/components/PromptInput.tsx` | 4,837 | 4,837 | 4,837 |
| `src/ink/ink.tsx` | 3,001 | 1,603 | 3,005 |
| `src/ink/components/App.tsx` | 1,398 | 1,398 | 1,398 |
| `src/components/messages/AssistantToolUseMessage.tsx` | 609 | 401 | 630 |
| `src/ink/dom.ts` | 383 | 191 | 394 |
| `src/theme.ts` | 122 | 111 | 379 |

The two byte-identical paths are `PromptInput.tsx` and `App.tsx`. The largest modified paths are also largely unchanged because recent edits were small or logic was extracted without replacing the surrounding source. Prioritize the terminal host (`ink.tsx`, `App.tsx`), input surface (`PromptInput.tsx`), and main conversation (`Chat.tsx`) for a defensible authorship/rights decision or genuinely independent replacement. The tool card and DOM measurement code form smaller bounded review batches. Preserve their behavior through focused rendering, keyboard/mouse, PTY, and installed-package checks.

PR #210 merged a tool-card replacement from `e2bba6874a86310aa5459f274ebcedf8e48f9cfc`, changing `AssistantToolUseMessage.tsx` to 236 lines. The same pinned-reference screen reports **zero** current lines in exact blocks of five or more, with a longest exact block of three lines. Its contract-driven implementation passed the local 137-gate preflight, focused terminal-rendering regressions, staged-package surface check, and an isolated macOS arm64 first-run install with pinned Harness setup and doctor. The 609-line result above is the earlier `683e5ac5` baseline, not the current main result. This change does not clear its helper modules, semantic similarity, the other source paths, or the private Git history. The author had access to earlier imported source during the broader project, so this is **not** a strict clean-room claim.

The DOM node and text-measurement host was subsequently replaced at `05a7820f36ed7ed2e02b6c5ede2abbf895704813`. The pinned screen finds 10 of its 170 current lines in exact blocks of five or more, with a longest block of five, compared with 383 of 394 lines in the earlier baseline. The remaining exact blocks are type/interface declarations. The local 137-gate preflight, staged-package check, and isolated macOS arm64 first-run setup and doctor passed. This measures only current-tree textual continuity; it does not clear semantic similarity, imported helper modules, or private history. This replacement is not a strict clean-room claim.

The pointer-dispatch function of `src/ink/components/App.tsx` was replaced at `c9d465c`. The same pinned screen now finds **1,055 of 1,057 current lines** in exact blocks of five or more (one contiguous block), down from 1,398 of 1,398 in the earlier baseline. The new pointer handler lives in `pointer-host.ts`, outside the 57 historical same-path candidates. Terminal pointer regressions cover dragging, selection, ambiguous X10 release, links, and double-click behavior. The surrounding `App.tsx` remains overwhelmingly identical to the pinned import, and the imported function remains in private history. This is a bounded current-tree reduction, not source-rights or clean-room clearance.

To reproduce, obtain the complete pinned Git tree and an external checkout or extracted source archive of that exact dsh-TUI commit. Keep the reference outside this repository; the script neither vendors nor republishes its source.

```sh
gh api 'repos/ccch1mneyyy/dsh-TUI/git/trees/c2eee95218d1decfce138f7d31ef7099cc391d00?recursive=1' > /tmp/flagqai-dsh-tree.json
python3 docs/releases/provenance-portion-screen.py /path/to/pinned-dsh-TUI-source /tmp/flagqai-dsh-tree.json > /tmp/flagqai-portion-screen.json
```

The script rejects a truncated or wrong reference tree and a mismatched source blob. Exact line identity is a continuity measure, **not** a legal conclusion or an estimate of unlicensed code. Shorter matching blocks, changed equivalents, renamed files, source outside the historical marker list, and earlier private Git history remain in scope. In particular, a previous compatibility refactor performed while the imported code was available is not proof of clean-room authorship. Do not open the existing repository or publish the CLI based on this screen.

## Prior release-blocker priority at main `2cfb8719894300741d8a3ea9babc0e36c6da862c`

The same pinned-reference script was rerun against this exact main commit.
To reproduce this snapshot after main advances, add
`--ref 2cfb8719894300741d8a3ea9babc0e36c6da862c` to the command above.
The 57 historical candidates now classify as **one byte-identical at the old
path**, **45 modified at the old path**, and **11 absent at the old path**.
The one byte-identical file is `src/components/PromptInput.tsx`. Among the 46
same-path files, the following four contain 15,809 of the 16,093 current lines
found in exact contiguous blocks of at least five lines (98.2% of this
screen's matched lines):

| Current source under `apps/cli/` | Exact lines in blocks of 5+ | Current lines | Longest exact block |
| --- | ---: | ---: | ---: |
| `src/screens/Chat.tsx` | 6,916 | 6,927 | 3,658 |
| `src/components/PromptInput.tsx` | 4,837 | 4,837 | 4,837 |
| `src/ink/ink.tsx` | 3,001 | 3,005 | 1,603 |
| `src/ink/components/App.tsx` | 1,055 | 1,057 | 1,055 |

The top four therefore dominate the current exact-overlap screen. Further
small leaf replacements may improve code ownership but cannot by themselves
remove this release blocker. The release decision needs defensible rights
evidence for these four source families or a genuinely independently sourced
replacement that preserves terminal interaction. The current maintainers have
had access to the imported code; changing these files in this checkout is not
automatically a clean-room replacement. The remaining 42 same-path files,
renamed or absent paths, shorter matching blocks, and source outside the 57
historical candidates still require review.

Any replacement route must retain the existing input, selection, rendering,
resize, mouse, session, and Harness approval behavior through focused
terminal/PTY regressions and staged/installed-package acceptance. The private
repository also retains earlier imported blobs, including files since deleted.
The installed-package PTY gate now exercises visible draft typing, left-arrow
editing, backspace, and Ctrl+C clearing without sending a model request, in
addition to provider selection and normal exit. This is a black-box behavior
contract for an eventual input replacement, not evidence that the current
`PromptInput.tsx` source has been replaced or cleared.

At CLI commit `986d5946c74087b0d238b9ce2ef59ec272b6e828`, the composer
text-movement and terminal-cell geometry helpers were replaced with a separate
implementation and focused tests. The pinned-reference screen now finds
**4,505 of 4,512 current `PromptInput.tsx` lines** in exact blocks of five or
more, down from 4,837 of 4,837 in the original import. Its longest unchanged
block is still 4,181 lines. The new tests cover grapheme-safe cursor movement,
whole-word wrapping, click mapping, and selection; the existing input-selection,
undo, and Vim-mode terminal regressions are now part of the CLI preflight. The author
had access to the imported implementation during this project, so this is not
a strict clean-room claim or clearance of the remaining component, related
helpers, or private history.

At main `5f5926f499a4d4a0ffd800bbc5e35ac9c93ba2d7`, rerunning the pinned
screen with `--ref 5f5926f499a4d4a0ffd800bbc5e35ac9c93ba2d7` finds
**15,477 of 15,756** lines in exact blocks of five or more in the same four
files (98.2% of the screen's matched lines): `Chat.tsx` 6,916/6,927,
`PromptInput.tsx` 4,505/4,512, `ink.tsx` 3,001/3,005, and `App.tsx`
1,055/1,057. These are current-source continuity counts, not an estimate of
unlicensed material or proof of independent authorship. The license evidence
and release decision are recorded in [the provenance review](UPSTREAM_PROVENANCE_RISK.md).

After the current source is cleared, a separately reviewed public source
export must exclude unapproved history; the current private repository should
not be opened directly. This snapshot establishes work order only and does
not close issue #93 (recorded in the maintainers' issue tracker)
or the broader source-rights gate #86 (recorded in the maintainers' issue tracker).
