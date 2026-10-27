# Source replacement plan without additional authorization records

**Status: resumed by the maintainer on 2026-10-19 (Asia/Shanghai).**
The 2026-10-17 deferral applied until the maintainer explicitly resumed
independently sourced TUI replacement. The previously verified runtime remains
the default while replacement candidates are evaluated. The first isolated
official Ink host probe and its limits are recorded in
[the probe input record](../../tests/official-ink-host/README.md). Resumption
does not resolve source rights or authorize publication.
The [Ink compatibility inventory](OFFICIAL_INK_COMPATIBILITY.md) records the
current import boundary and adapter work before any default renderer switch.
The [headless source boundary](HEADLESS_SOURCE_BOUNDARY.md) records a technical
dependency reduction; it does not clear or remove the inherited TUI package.
The [official Yoga subportion](YOGA_REPLACEMENT_INPUTS.md) removes the
historical TypeScript layout port from the current tree, while leaving the
larger imported terminal host and source-rights review open.

Decision recorded on **2026-10-17 (Asia/Shanghai)**: the maintainer reports
no additional authorization, independent-implementation, or source-review
records for issues #86/#93. Do not wait for such records as the only path
forward. Prepare replacements or removals with documented independent inputs.
The maintainer defers Windows/hosted CI execution until the release environment
is available; it remains a final release acceptance requirement.

This plan does not establish infringement or clear any current code. Preserve
all applicable upstream notices and the private provenance evidence. Do not
use leaked code as a replacement reference. Prior access to the imported
implementation prevents claiming that an ordinary local rewrite is a strict
clean-room implementation. Fewer matching lines or a new initial commit is
not an acceptance criterion for source clearance.

## Work order and acceptance

| Batch | Replacement boundary | Required behavior and evidence |
| --- | --- | --- |
| 1 | Replace the embedded terminal host as a coherent subsystem, including its renderer extensions and Yoga port; do not clear it by replacing a few leaf components. Evaluate an official, licensed terminal renderer from its own pinned upstream release. | Record the actual source/version, license, notices, and any new adapter inputs. Prove render/resize/exit, keyboard input, mouse/selection, copy/link handling, Unicode cell width, and terminal restoration. Evaluate extension compatibility before changing the default entry. |
| 2 | Replace `PromptInput.tsx` and its dependent composer helpers against a recorded user-visible behavior contract. | Draft typing/editing, grapheme and word movement, multiline/paste, undo, history, Vim mode, selection and cancellation. Use existing behavior tests as regression evidence, without copying implementation bodies. |
| 3 | Replace `Chat.tsx` and its UI-only coordination with an adapter to Harness. | Harness remains authoritative for Agent execution, session persistence, tools, approvals and cancellation. Cover streaming, tool results, scientific outputs, reconnect/restart/resume, provider errors, and permission flows. |
| 4 | Review presentation components, themes, markdown and utility counterparts, including renamed or removed old paths. | Record replacement/removal decisions and source inputs per current portion. Old-path absence alone does not establish that related current code is absent. Review helpers and assets beyond the historical marker list. |

For every replacement batch, retain a short input record: intended behavior,
permitted upstream/documentation references at exact revisions, dependencies
and license notices, changed paths, validation results, and remaining scope.
Existing compatibility refactors remain useful behavior evidence but are not
retroactively labeled independent provenance. Pin and inspect a proposed
replacement's own source and licensing before importing it.

> **Withdrawn 2026-10-27.** The independent Ink client and its separate package
> profile were removed from this repository; the CLI now ships a single
> renderer. Commands, flags, and links naming that candidate below are retained
> only as a historical record and no longer run.

The independent Ink candidate still compiles inherited non-presentation CLI
source. After the Harness/FlagQuantum-only scope change in merged PR #426,
private main `e8737fbb06f1587406ad0a9e6d43fc260a7b2a3a` has **39**
non-generated compiler inputs byte-identical to the pinned dsh-TUI import.
The [compiler-source lineage audit](SOURCE_PROVENANCE_AUDIT.md#independent-ink-compiler-source-lineage)
records the older 114-file baseline and this current count. Removing the
optional backends and presentation paths narrows review, but does not clear
the remaining source or private history.

The [import-edge priority screen](independent-ink-runtime-lineage.mjs) on that
same tree classifies the 39 exact inputs as **27** reachable from the seven
declared candidate roots through static import/export syntax, **one** behind a
dynamic import (`dsh-adapter/oauth-credential-source.ts`), and **11** read by
the compiler without either edge path. Run it with the same complete pinned
dsh-TUI tree used by the compiler-source audit:

```sh
node docs/releases/independent-ink-runtime-lineage.mjs \
  --upstream-tree /tmp/flagqai-dsh-tree.json \
  --out /tmp/flagqai-independent-runtime-lineage.json
```

This is syntax-based prioritization, not an execution trace: TypeScript may
erase apparently static imports, and type/other compiler inputs still appear
in the candidate source tree. None of the three groups is safe to publish or
remove based on this screen. Review the 27 statically reachable files first
while preserving Harness session authority and the FlagQuantum capability
contract; retain the other 12 in the source-rights gate.

The [cross-path portion screen](INDEPENDENT_INK_CROSS_PATH_REVIEW.md) checks
whether five-line-or-longer exact blocks from the pinned historical candidates
appear under *different* names in the independent compiler graph. Its current
maximum is six contiguous lines across seven current paths; six historical
paths lack a body at that pinned import. This narrows one exact-text question,
not the broader source-rights decision or the default TUI replacement.

The [dsh-std vendor lineage gate](DSH_STD_VENDOR_LINEAGE.md) pins the complete
public upstream tree and verifies the vendored MIT license files. It narrows
one dependency-family review; it does not clear the separate dsh-TUI portions.

On private main `1f49902e8029279eb052623c5a7f6d15a9fe3359`, a new
metadata-only screen reports **30** non-generated exact compiler inputs in
the independent Ink candidate: **20** statically reached and **10** compiler
only. The current exact paths are listed in the private JSON report generated
by `independent-ink-runtime-lineage.mjs`; no implementation bodies were read
for this screen. A local preflight budget now fails if this exact count grows
above 30 or a new compiler path appears without reviewing the pinned public
path/blob manifest. Prioritize the 20
statically reached paths for coherent replacements, then review the remaining
10 and changed-source counterparts. The budget guards against one kind of
regression; it does not clear any current path or the default TUI.

After each source change, run focused behavior checks, compile, verify the
staged package, and perform relevant isolated installed-package acceptance.
Run the full local regression before freezing a replacement candidate.
Windows and the hosted matrix must execute before release; the current Unix
passes do not verify a future renderer replacement or Windows behavior.
Do not publish source/npm, open private history, or change account settings
as part of this work.

## Exact historical-path inventory

Snapshot: CLI commit `ddca96044a96e49a91cd54298d357319bdd4e910`.
Reference import: dsh-TUI `c2eee95218d1decfce138f7d31ef7099cc391d00`.
There are **57** historical candidates: **46 modified at the same path**,
**11 absent at the old path**, and **0 identical or exact relocations**.
These are continuity states, not rights decisions or the entire review scope.
The marker meanings and pinned historical source evidence remain in
[the provenance risk record](UPSTREAM_PROVENANCE_RISK.md).

| Historical path under `apps/cli/` | Current continuity state | Work batch |
| --- | --- | --- |
| `src/cc/figures.ts` | Absent at old path; counterpart review required | 4 — relocated utility review |
| `src/cc/format.ts` | Absent at old path; counterpart review required | 4 — relocated utility review |
| `src/cc/markdown.ts` | Absent at old path; counterpart review required | 4 — relocated utility review |
| `src/cc/terminal.ts` | Absent at old path; counterpart review required | 4 — relocated utility review |
| `src/components/CommandSuggestions.tsx` | Modified; unresolved | 4 — presentation and utility review |
| `src/components/HelpMenu.tsx` | Modified; unresolved | 4 — presentation and utility review |
| `src/components/InterruptedByUser.tsx` | Absent at old path; counterpart review required | 4 — presentation and utility review |
| `src/components/Markdown.tsx` | Modified; unresolved | 4 — presentation and utility review |
| `src/components/MarkdownTable.tsx` | Modified; unresolved | 4 — presentation and utility review |
| `src/components/PromptInput.tsx` | Modified; unresolved | 2 — composer |
| `src/components/Spinner/GlimmerMessage.tsx` | Modified; unresolved | 4 — presentation and utility review |
| `src/components/Spinner/SpinnerAnimationRow.tsx` | Modified; unresolved | 4 — presentation and utility review |
| `src/components/Spinner/SpinnerGlyph.tsx` | Modified; unresolved | 4 — presentation and utility review |
| `src/components/Spinner/spinnerUtils.ts` | Modified; unresolved | 4 — presentation and utility review |
| `src/components/Spinner/useStalledAnimation.ts` | Modified; unresolved | 4 — presentation and utility review |
| `src/components/StreamingMarkdown.tsx` | Modified; unresolved | 4 — presentation and utility review |
| `src/components/ThinkingToggle.tsx` | Replaced from a recorded behavior contract; host/caller rights still unresolved | 4 — [input record](THINKING_TOGGLE_SOURCE_INPUTS.md) |
| `src/components/ToolUseLoader.tsx` | Absent at old path; counterpart review required | 4 — presentation and utility review |
| `src/components/WorkingSpinner.tsx` | Modified; unresolved | 4 — presentation and utility review |
| `src/components/design-system/Byline.tsx` | Absent at old path; counterpart review required | 4 — presentation and utility review |
| `src/components/design-system/Divider.tsx` | Modified; unresolved | 4 — presentation and utility review |
| `src/components/design-system/KeyboardShortcutHint.tsx` | Absent at old path; counterpart review required | 4 — presentation and utility review |
| `src/components/design-system/ListItem.tsx` | Modified; unresolved | 4 — presentation and utility review |
| `src/components/design-system/LoadingState.tsx` | Modified; unresolved | 4 — presentation and utility review |
| `src/components/design-system/Pane.tsx` | Modified; unresolved | 4 — presentation and utility review |
| `src/components/design-system/ProgressBar.tsx` | Modified; unresolved | 4 — presentation and utility review |
| `src/components/design-system/StatusIcon.tsx` | Absent at old path; counterpart review required | 4 — presentation and utility review |
| `src/components/design-system/ThemedBox.tsx` | Modified; unresolved | 4 — presentation and utility review |
| `src/components/design-system/ThemedText.tsx` | Modified; unresolved | 4 — presentation and utility review |
| `src/components/messages/AssistantTextMessage.tsx` | Modified; unresolved | 4 — presentation and utility review |
| `src/components/messages/AssistantThinkingMessage.tsx` | Modified; unresolved | 4 — presentation and utility review |
| `src/components/messages/AssistantToolUseMessage.tsx` | Modified; unresolved | 4 — presentation and utility review |
| `src/components/messages/MessageMetadata.tsx` | Modified; unresolved | 4 — presentation and utility review |
| `src/components/messages/UserPromptMessage.tsx` | Modified; unresolved | 4 — presentation and utility review |
| `src/hooks/useBlink.ts` | Modified; unresolved | 4 — presentation and utility review |
| `src/ink/Ansi.tsx` | Modified; unresolved | 1 — terminal host |
| `src/ink/colorize.ts` | Modified; unresolved | 1 — terminal host |
| `src/ink/components/AlternateScreen.tsx` | Modified; unresolved | 1 — terminal host |
| `src/ink/components/App.tsx` | Modified; unresolved | 1 — terminal host |
| `src/ink/components/Box.tsx` | Modified; unresolved | 1 — terminal host |
| `src/ink/components/Button.tsx` | Absent at old path; counterpart review required | 1 — terminal host |
| `src/ink/components/ClockContext.tsx` | Modified; unresolved | 1 — terminal host |
| `src/ink/components/Link.tsx` | Modified; unresolved | 1 — terminal host |
| `src/ink/components/Newline.tsx` | Modified; unresolved | 1 — terminal host |
| `src/ink/components/NoSelect.tsx` | Modified; unresolved | 1 — terminal host |
| `src/ink/components/RawAnsi.tsx` | Absent at old path; counterpart review required | 1 — terminal host |
| `src/ink/components/Spacer.tsx` | Modified; unresolved | 1 — terminal host |
| `src/ink/components/TerminalFocusContext.tsx` | Modified; unresolved | 1 — terminal host |
| `src/ink/components/Text.tsx` | Modified; unresolved | 1 — terminal host |
| `src/ink/dom.ts` | Modified; unresolved | 1 — terminal host |
| `src/ink/hooks/use-terminal-size.ts` | Modified; unresolved | 1 — terminal host |
| `src/ink/ink.tsx` | Modified; unresolved | 1 — terminal host |
| `src/ink/reconciler.ts` | Modified; unresolved | 1 — terminal host |
| `src/ink/render-to-screen.ts` | Modified; unresolved | 1 — terminal host |
| `src/ink/termio/osc.ts` | Modified; unresolved | 1 — terminal host |
| `src/screens/Chat.tsx` | Modified; unresolved | 3 — conversation adapter |
| `src/theme.ts` | Modified; unresolved | 4 — presentation and utility review |

The historical list does not cover every renderer extension, the Yoga port,
fixture, guide, or source asset. The broader [source audit](SOURCE_PROVENANCE_AUDIT.md)
remains in scope. The portrait sprite has already been removed from the
current distribution; its old private history must remain private.

## Final disposition

Do not close #86/#93 on the basis of this plan. Closure requires documented
source/removal decisions for the complete candidate, associated notices, and
passing acceptance for the replacement implementation. Freeze and inventory
the exact approved source/package only after those changes. Preserve the
existing public LICENSE root when a separately approved source import occurs.
