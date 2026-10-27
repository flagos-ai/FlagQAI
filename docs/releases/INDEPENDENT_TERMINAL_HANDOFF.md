# Independent terminal implementation handoff

This is an implementation brief for issue #93 (recorded in the maintainers' issue tracker), not a source-rights clearance or permission to release. The [provenance record](UPSTREAM_PROVENANCE_RISK.md) describes why the inherited dsh-TUI MIT notice alone cannot settle the historically attributed Claude Code portions. The current maintainers have already seen the imported source, so their compatibility refactors cannot be described as a strict clean-room replacement. A rights reviewer must approve the inputs, participants, and resulting source before any public export.

## Work boundary

The first independent implementation should cover the terminal host, composer, and conversation screen together. The pinned [portion screen](UPSTREAM_PORTION_SCREEN.md) identifies `src/ink/ink.tsx`, `src/ink/components/App.tsx`, `src/components/PromptInput.tsx`, and `src/screens/Chat.tsx` as the largest surviving exact-overlap families. Replacing a small leaf while retaining these families cannot close #93. The rights review must also cover the other historical candidates, renamed paths, bundled helpers, and current-source portions outside the marker list. The old private Git objects will be excluded only by a separately reviewed fresh-root source import.

The implementation may use properly licensed public libraries and FlagQAI-owned protocol/API contracts after their rights are checked. It must keep DeepSeek Harness authoritative for Agent execution, tools, approvals, sessions, and persistence. The terminal client may present and dispatch those operations; it must not create a second Agent loop or copy private Harness internals. Web and Desktop remain placeholders for this release.

## Observable contract

The following are product behaviors, not source-code instructions. Establish expected outputs from product requirements and separately reviewed black-box recordings. Do not supply the historical dsh-TUI tree, this repository's imported implementation, snippets from it, or a draft derived from those snippets to an independent implementer.

| Area | Required behavior | Existing regression gate |
| --- | --- | --- |
| Session and messages | Start and resume a Harness-owned session; show user, assistant, tool, approval, question, and Todo records without inventing completion. | `verify:live-session`, `verify:session-extraction`, `verify:channel-goal-todo`, `verify:approval-visibility` |
| Composer | Preserve Unicode cursor movement, selection, paste, undo, command entry, Vim mode, draft handoff, and Ctrl+C clearing. | `verify:input-selection`, `verify:vim-mode`, `verify:composer-draft-handoff`, installed PTY draft check |
| Terminal host | Keep alternate-screen and normal-screen output, resize reflow, scroll and selection, keyboard/mouse dispatch, and terminal-mode cleanup on exit. | `verify:renderer-primitives`, `verify:resize-reflow`, `verify:wheel-selection`, `verify:selection-resize`, installed PTY exit |
| Rich output | Render streaming Markdown/code, tool activity, progress and status, links, and supported terminal-image fallbacks with bounded layout work. | `verify:streaming-markdown-blocks`, `verify:markdown-codebox-performance`, `verify:terminal-images`, `verify:progress-bar` |
| Runtime boundary | Forward approvals, cancellation, questions, and provider choices through Harness adapters; preserve credential redaction and local session authority. | `verify:approval-visibility`, `verify:provider-manager`, clean installed interaction acceptance |

The `verify:*` names above are scripts in `apps/cli/package.json`; the installed PTY and interaction checks are separately invoked acceptance scripts. These gates are regression evidence, not a complete specification or a claim that their source files are cleared for handoff. A rights reviewer should decide whether each test may be shared as source, run only as an opaque verifier, or replaced with a new black-box test. Record that decision before granting implementation access. An unexposed implementer should receive only approved behavior descriptions, interface declarations, and test observations.

## Evidence required for a replacement

1. Record the implementer's access boundary and approved reference materials before work begins. Keep the new implementation in a separate object store without importing this repository or the historical dsh-TUI source.
2. Record each new dependency's exact version, license, notices, and any native-binary/source-access obligations. Preserve legitimate dsh-TUI and dsh-std notices for any portions that remain.
3. Run focused terminal tests, the full CLI preflight, staged package verification, and clean installed macOS/Linux PTY and Harness interaction checks on the exact candidate tree. Run a genuine installed Windows check before claiming Windows support. Scripted models suffice for transport tests; a real provider request requires separate authorization.
4. Have the rights reviewer inspect the finished current-source tree and its import history, including helpers and renamed files. A zero exact-line match, successful tests, or a new filename is not proof of independent provenance. Record any rightsholder grants or independent-origin evidence per affected family.
5. Only after current-source rights are resolved, prepare the user-approved public snapshot as a new initial commit and run `verify-clean-initial-import.mjs` against the exact reviewed tree. The private repository and its earlier blobs stay private. This handoff neither creates that repository nor changes visibility or npm publication state.

No implementation or public-release decision follows automatically from this brief. The acceptance owner must keep #93 and #86 open until the source and rights evidence actually meet their criteria.
