# Upstream provenance risk in the CLI renderer

This is a **release blocker**, not a legal conclusion about each current line.
The component and renderer changes recorded below are compatibility refactors
made while the imported dsh-TUI implementation was available to the authors.
Descriptions such as "independently implemented" or "contract-based" mean that
the current source was changed and its behavior tested; they do **not** mean a
strict clean-room process occurred, establish independent provenance, or clear
the code for public distribution. A source-rights review must determine whether
the affected material is licensed for redistribution. If replacement is needed,
it must use a genuinely independent process with documented inputs. The
imported versions also remain in the private Git history.

The CLI source is derived from dsh-TUI v0.14.0. An earlier public dsh-TUI
[source-attribution audit](https://github.com/ccch1mneyyy/dsh-TUI/blob/4f7c58e0aad76369d7206287b256cc816a1f4061/docs/project-documentation/origin.md)
classified 57 then-current files as ports from leaked Claude Code source using
explicit comments and other markers. The next upstream
[cleanup commit](https://github.com/ccch1mneyyy/dsh-TUI/commit/3ce86d540744)
removed that audit and many source comments. Removing comments did not
establish rights to the code they described.

This finding is the upstream project's own historical assessment. Its count
is tied to that older tree and must not be presented as a count of affected
FlagQAI-CLI files. Some markers (for example, an environment-variable name)
could indicate compatibility rather than copying; other historical comments
explicitly said `ported CC build` or `verbatim from Claude Code`. None of these
facts by itself decides the rights to every current function. Together they
rule out treating the dsh-TUI MIT notice as sufficient clearance for the
renderer and related UI without a separate review.

## Rightsholder license evidence

Anthropic's [official Claude Code license](https://github.com/anthropics/claude-code/blob/main/LICENSE.md),
checked on 15 October 2026, states that Anthropic retains all rights and
directs use to its Commercial Terms of Service. This is not a public
open-source license for redistributing Claude Code source. The current license
does not authenticate which dsh-TUI portions came from Claude Code, nor does
it establish the terms that governed any earlier source. It does mean this
review cannot infer a redistribution grant from the public Claude Code
repository or from dsh-TUI's MIT notice alone. For each affected portion,
obtain rights evidence from the relevant rightsholder or use a genuinely
independently sourced replacement, with the input and authorship process
documented. A fresh public repository with one initial commit addresses the
private-history problem only; it does not change rights to its current files.

## Pinned local comparison

At FlagQAI-CLI main `15dd1d8d5259d3f428865698758cb042888cf616`, the
following source paths named by the upstream audit were checked against the
pinned dsh-TUI v0.14.0 import `c2eee95218d1decfce138f7d31ef7099cc391d00`:

| Path under `apps/cli/` | Local versus imported blob | Historical upstream marker |
| --- | --- | --- |
| `src/theme.ts` | Identical | `verbatim from Claude Code` comment |
| `src/ink/reconciler.ts` | Identical | `CLAUDE_CODE_*` environment reads |
| `src/ink/render-to-screen.ts` | Identical | `ported CC build` comments |
| `src/ink/Ansi.tsx` | Identical | `react/compiler-runtime` transformed import |
| `src/ink/components/App.tsx` | Identical | `CLAUDE_CODE_ACCESSIBILITY` reads |
| `src/ink/termio/osc.ts` | Identical | Internal Anthropic Slack links |
| `src/components/WorkingSpinner.tsx` | Identical | Named by the historical audit |
| `src/screens/Chat.tsx` | Changed locally | Named by the historical audit; review remaining portions |

The source comments and links above were read at upstream parent commit
`4f7c58e0aad76369d7206287b256cc816a1f4061`. They are absent or altered
in the later imported source. The first seven local Git blob IDs match the
pinned import tree exactly; that proves continuity through the cleanup, not
independent authorship or a redistribution grant. `Chat.tsx` has changed since
import and needs portion-level review.

To repeat the blob comparison, fetch the complete recursive Git tree at the
pinned import commit, confirm `truncated: false`, and compare each listed
`tree[].sha` with `git hash-object apps/cli/<path>`. The existing
`source-inventory.mjs` script checks the whole current CLI tree against that
same upstream tree; it does not make an authorship or rights decision.

## Historical marker screen

The upstream audit classified 57 files as `cc-port` at commit
`b2f408740a544f92a1e6e5ca8e07017793cabd63`. The metadata-only
[marker manifest](upstream-provenance-markers.json) now screens 59 paths in
that exact tree: 40 with an explicit source claim (including seven missed by
the first line-only scan because their claim crossed a comment line), 13
with a `react/compiler-runtime` reference, six with a `CLAUDE_CODE_*` name,
and one with an internal Anthropic Slack link. Screens overlap. The upstream
report explicitly reclassified `src/types/cc.d.ts` as project-written because
its compiler-runtime reference is only a typing declaration. The script-only
`scripts/perf-probe.cjs` sets a compatibility environment variable; it is not
among the report's five `CLAUDE_CODE_*`-classified files. Excluding these two
mechanical matches reconstructs the report's **57 historical candidate paths**.
The report's original per-file verdict TSV was not committed, so this is a
reconstruction from the published rules and counts, not an independently
authenticated copy of that missing TSV or a legal judgment.

At FlagQAI-CLI main `1fa6e31748ead7adc7c74c45b71442e5482698d2`, 44 of
the initial 52 screened paths retained the same path and exact blob as the
pinned dsh-TUI import. On main
`3a334142748cbac4570e472e207bf4ee3e8e566f`, the completed screen finds
50 of the 57 reconstructed `cc-port` paths at the same path and byte-identical
to that import; `src/screens/Chat.tsx` has changed, and six old paths were
absent at the same path already at import. `src/cc/figures.ts`,
`src/cc/format.ts`, and `src/cc/markdown.ts` have similarly named files under
`src/terminal-utils/`; the old `src/components/InterruptedByUser.tsx` path is
absent while the current UI has `src/components/TurnInterruptedRow.tsx`.
These are *mapping leads*, not clearance or proof of exact derivation.
Renamed, changed, and absent paths require portion-level review.

For a current-tree status snapshot, run the metadata-only checker with the
complete pinned import tree (it rejects a truncated or different commit):

```sh
gh api 'repos/ccch1mneyyy/dsh-TUI/git/trees/c2eee95218d1decfce138f7d31ef7099cc391d00?recursive=1' > /tmp/flagqai-dsh-import-tree.json
node docs/releases/provenance-candidate-status.mjs /tmp/flagqai-dsh-import-tree.json --json
```

On main `dabb94e84e24ac558889de17c7f0d00bdd480dd6`, the 57 historical
candidate paths classify as **2 identical at the old path**, **46 modified at
the old path**, and **9 absent at the old path**; none has an exact-blob
relocation. The two identical current paths are `src/components/PromptInput.tsx`
and `src/ink/components/App.tsx`. This is a **continuity inventory**, not a
rights clearance: a modified file can retain affected portions, an absent
path can have a rewritten counterpart, and the old blobs remain in Git history.
The nine absent-path mappings and the 46 changed files still require the
portion-level investigation in issue #93.

The CLI progress bar has been replaced from its public component contract and
terminal-rendering requirements, without using the historical implementation
as a source for the replacement. Its new rendering regression checks progress
bounds, fractional cells, fixed width, and color separation. This is one
current-tree replacement only: the imported version remains in Git history,
and the remaining candidate paths still require review or replacement.

The same contract-based replacement approach now covers the compact status
`Byline` and assistant `MessageMetadata` rows. Their screen-level regression
checks separators, missing fields, a one-row local time/model label, and the
transcript parent's right alignment. The unused `StatusIcon` module was
removed from the current source tree after confirming it had no source imports
or package export. These changes reduce the current distribution surface but
do not clear their old Git blobs or any other candidate path.

The dialog `Pane` and asynchronous `LoadingState` have also been reimplemented
from their documented terminal presentation contracts. A screen-level check
covers the one-row gap, colored top rule and horizontal content padding, plus
the loading message and optional second-row subtitle. Their old versions still
exist in private Git history, and the renderer and remaining components need
separate review before any public source release.

The shared `ThemedText` and `ThemedBox` wrappers have been replaced from their
public prop contracts. A new palette resolver handles semantic names and raw
terminal colors; the wrappers preserve hover/explicit/dim precedence and
forward the Box interaction surface to the renderer. A terminal-screen
regression checks foreground/background colors, bold semantic dim, border
side overrides, and theme selection. This does not resolve the rights of the
underlying theme palettes, Ink renderer, other UI modules, or Git history.

The selection-row `ListItem` and layout-measured `Divider` are now also
contract-based implementations. List rows retain focus/selection markers,
descriptions, cursor declaration, clickable hover, and single-line text even
through fragments. The divider keeps container-width negotiation, bounded
resize behavior, title clipping, and page-margin bleed. The kernel-picker
integration check additionally exposed and corrected a theme-wrapper
regression: semantic `dimColor` must override an explicit child color on an
unavailable option. Full picker and page-margin regressions are required for
this replacement; other historical candidate paths and Git history remain
unresolved.

The renderer's `Link` and `NoSelect` leaf wrappers have also been replaced
from their documented public contracts. The link regression covers OSC 8
metadata and plain-text fallback; the selection regression checks the
per-cell exclusion map both for the box itself and the optional left gutter.
Full Chat drag-copy and renderer regressions remain part of acceptance. The
underlying renderer, other imported leaves, and private history still need
independent review or replacement.

The unused Ink `Button` and `RawAnsi` component wrappers have been removed
from the current source and staged package. Neither was exported or used by
the product: `Button` had no callers, while `RawAnsi` appeared only in a
renderer test. That test now exercises the same intrinsic `ink-raw-ansi` node
directly, so measured ANSI rows remain covered. The historical wrappers still
exist in private Git history; this deletion does not clear the underlying Ink
renderer or the other historical candidates.

The active thinking-display selector and tool-status symbol leaves have now
been reimplemented from their public props and observed terminal behavior.
A screen regression covers Chinese and English selector layout, focused and
selected choices, and active/error/settled tool symbols. This replaces only
these two current component bodies; their imported versions remain in private
history. The shared blink hook, theme, renderer, and other candidate source
still need separate rights review or replacement.

The shared spinner frame and color-math module has been replaced with a
separately written implementation of its public pure-function contract:
independent frame arrays, RGB interpolation/formatting/parsing, and standard
HSL-to-RGB conversion. Its focused regression covers frame mutation,
fractional colors, hue wrapping, and invalid input. The module is used by
spinner, loading, trajectory, and logo code, so full rendering and installed
CLI acceptance remain required. This replacement affects only the current
source body; its earlier imported version remains in private Git history.

The active spinner glyph and glimmering status label are independently
implemented from their public props and observed terminal presentation. A
screen-level regression covers the one-cell animated glyph in its stable
two-cell slot, reduced motion, stalled color, one-row status text, and
grapheme-aware highlight over wide characters. This replaces only their
current component bodies. The imported versions remain in private Git
history; theme, renderer, and other candidate sources remain unresolved.

The active `SpinnerAnimationRow` and its `WorkingSpinner` caller are now
independently implemented from their public props and observed terminal
behavior. They retain the stable top gap, phase-localized verb, live language
switch, animated glyph, pause-aware elapsed time, response/upload counters,
thought-status grace period, and narrow-terminal truncation. Focused screen
and live terminal regressions cover these behaviors. This replaces only the
current component bodies; the renderer, theme, other candidates, and imported
versions in private Git history remain unresolved.

Five shared terminal primitives and hooks—`Spacer`, `Newline`,
`TerminalFocusContext`, `use-terminal-size`, and `useBlink`—are independently
implemented from their public contracts. A screen regression covers flex-axis
space, line counts, focus snapshots, narrowed size context, and deterministic
blink phases. The pinned marker inventory reports **24** historical candidate
paths still byte-identical at the same path after this batch, down from 29
before it. This is a source-continuity count, not a count of cleared rights:
changed, absent, and renamed paths and private Git history remain in scope.

The active stalled-spinner timing hook is independently implemented from its
public contract and observed silence threshold. A mounted-clock regression
covers the three-to-five-second warning ramp, frame-time color easing, new
output, active tools, and reduced motion. The pinned same-path inventory now
has **23** byte-identical historical candidates. This replaces only the
current hook body; the earlier blob in private history and all other source
rights questions remain unresolved.

The shared animation clock now has an independently implemented current body.
A deterministic scheduler regression covers one timer only while visible
animations keep it alive, passive listeners, interval changes, suspension,
cleanup, and focus-based throttling. The pinned same-path inventory has **22**
byte-identical historical candidates after this change. This count does not
clear changed or renamed source, earlier Git history, or the wider rights gate.

The slash-command suggestion panel now has an independently implemented
current body based on its public component contract. Focused terminal and
screen regressions cover the five-row window, selected command, held-command
appearance and click mapping, localized descriptions, and narrow layouts. The
pinned same-path inventory has **21** byte-identical historical candidates
after this change. This only replaces the current panel body: its historical
Git blob and the remaining candidate source rights still require resolution.

The CLI help menu now has a new component body built around its exposed
shortcut, command, and viewport props. The existing terminal regressions cover
wide and narrow layouts, command-list scrolling and mouse selection, help
overlay ownership, and launchpad restoration. The pinned same-path inventory
has **20** byte-identical historical candidates after this change. This count
only measures current-tree continuity: the previous HelpMenu blob remains in
private Git history, and neither this replacement nor its tests establish
rights to the renderer or other candidate source.

The current `Ansi` text projection has been replaced using its public prop
contract and the existing parser action types. Focused renderer checks cover
SGR reset, named/indexed/RGB colors, dim precedence, text decorations, OSC 8
link scope, CJK width, line breaks, and control-only zero-height output. The
pinned same-path inventory has **19** byte-identical historical candidates
after this change.
The previous `Ansi.tsx` blob remains in private Git history, and the parser,
renderer, other candidates, and distribution rights still require review.

The user prompt row now has a new component body based on its exposed message
props and terminal presentation contract. Renderer checks cover the marker,
multiline and narrow text, turn spacing, semantic color, selection highlight,
and long-line visibility. Transcript regressions cover wrapped prompts and
mouse click-to-expand/collapse after a 60,000-character input; this test now
runs in the regular build verification. The pinned same-path inventory has
**18** byte-identical historical candidates after this change. Its earlier
blob remains in private Git history, and changed or renamed source and the
rest of the renderer still need rights review.

The settled assistant text row now has a separately written body based on the
transcript leaf's public props and visible row contract. A screen regression
checks its marker, Markdown rendering, wrapping, turn spacing, selection
highlight, and parent-owned expansion. The full CLI build, staged package
check, and clean installed TUI startup/exit passed on macOS arm64. At commit
`c7c1746f51b6e1e808dab9cd0a3d3af52927fa4b`, the pinned same-path marker
inventory reports **17** byte-identical historical candidates. This is one
current-tree replacement only; its earlier blob remains in private Git history,
and no rights conclusion follows for the other candidate paths.

The current `AlternateScreen` boundary has a new React component body based on
its observable terminal contract: a fixed-height viewport, DEC alternate-buffer
entry/exit, optional mouse tracking, renderer buffer state, and inherited-screen
handoff ownership. Ink now exposes the output stream it owns so this boundary
targets the correct stream when a test or host renders to a non-default TTY.
The source change passed the 123-gate CLI preflight, staged package check, and
clean installed macOS arm64 PTY startup/prompt/exit. Focused page-margin,
long-line, rewind, mouse-cleanup, terminal-query, drag, and session-supervisor
regressions passed. The old component still exists in private Git history;
`ink.tsx` and the other renderer paths remain under the same rights review.

The current terminal color formatter has a separately written source body based
on the public `Color`/`TextStyles` contract and observed theme and image
behavior. It supports named ANSI, indexed, RGB, short and long hex colors,
text decorations, and background SGR codes for image erasure even without a
TTY. Theme and Sixel image regressions cover those behaviors. This is a
current-source replacement only: the imported color formatter remains in
private Git history, and the surrounding renderer still needs rights review.

The current terminal `Text` leaf has an independently written component body
from its public props and renderer behavior. It retains raw color and text
styles, wrap mode, decoration identity, a cursor-targetable DOM ref, and
header-only decoration when body text is empty. Renderer and Markdown
decoration regressions check blank leaves, numeric text, refs, ANSI styling,
wrapping, CJK layout, copy bytes, and header-only code frames. The previously
imported body remains in private Git history; this replacement does not clear
the surrounding renderer or the repository for public release.

The current terminal `Box` container has an independently written body based
on its public layout/event props and observed renderer behavior. It retains
the default flex layout and overflow-axis rules, focus attributes, ref
targeting, and mouse/drag/wheel event forwarding. Focused layout, long-line
click expansion, and drag protocol regressions cover these behaviors. The
former imported body remains in private Git history; the larger renderer and
other source candidates still require review before public release.

The current Markdown table view has a separately implemented body based on its
public token contract and terminal layout tests. Wide tables retain borders,
alignment, empty cells, ANSI-styled inline content, and Unicode cell widths;
narrow terminals use labeled fields and hard-wrap long values. This current
source replacement does not remove the imported body from private Git history
or settle the remaining source-rights review.

The current assistant thinking row has a separately written body based on its
public props and transcript tests. It retains the fixed-height live preview,
full arrived-text ticker during smooth reveal, expanded Markdown body, count-
only reasoning summary, localization, duration, selection, and click handoff.
Focused preview, token, and reveal regressions cover these states. Its former
body remains in private Git history, and other candidates still need review.

The current streaming Markdown component has a separately written incremental
partitioner. It retains completed blocks as memoized children, reparses only
the growing tail on ordinary appends, and rebuilds when definitions or a
non-prefix replacement can change earlier references. Pathological unbroken
live lines show a bounded tail preview so the newest text stays visible; the
settled transcript still owns and renders the complete source. The table-to-table gap
in the settled Markdown renderer was also corrected. Cell-equivalence,
spacing, reference-link, Unicode, and two code-frame performance regressions
now run in the CLI preflight. This addresses the current streaming component
body only; the imported blob remains in private history, and the surrounding
Markdown renderer still has unresolved provenance.

To rerun the same-path inventory, fetch the complete Git trees at both pinned
commits and run the checker. It refuses an unexpected or truncated tree and
checks every manifest blob against the historical baseline:

```sh
gh api 'repos/ccch1mneyyy/dsh-TUI/git/trees/b2f408740a544f92a1e6e5ca8e07017793cabd63?recursive=1' > /tmp/flagqai-provenance-baseline.json
gh api 'repos/ccch1mneyyy/dsh-TUI/git/trees/c2eee95218d1decfce138f7d31ef7099cc391d00?recursive=1' > /tmp/flagqai-provenance-import.json
node docs/releases/provenance-marker-inventory.mjs /tmp/flagqai-provenance-baseline.json /tmp/flagqai-provenance-import.json --paths
```

The result is an inventory for deciding what to examine or independently
replace. It separates all 59 mechanical matches from the reconstructed 57
historical `cc-port` candidates and never treats a changed, renamed, or
deleted path as resolved.

Before replacing `src/ink/termio/osc.ts`, the CLI preflight now checks its
observable serialization, parsing, color, tab-status, and multiplexer behavior.
The existing OSC 8 injection/sanitization regression also runs in preflight.
Those checks pinned compatibility and security expectations before the
replacement; by themselves they did **not** clear OSC provenance risk.

The current `src/ink/termio/osc.ts` body has since been independently
implemented around documented OSC, OSC 8, OSC 52, and multiplexer escape
sequences. Its focused contract now also exercises native clipboard writes,
tmux-buffer writes, and the returned OSC 52 sequence with temporary fake executables so
no real clipboard is modified. This replaces the current OSC body only. The
older imported blob remains in private Git history; other same-path and
changed-path candidates, and Linux/Windows runtime behavior, still need
separate review before a public source release.

The current `src/ink/render-to-screen.ts` body has also been independently
implemented from its exported contract and renderer behavior. It retains
isolated React painting, shared style IDs across snapshots, effect cleanup,
wide-cell search coordinates, no-select handling, and the current-match
overlay. The renderer, theme, pane, spinner, animation-clock, and text-wrap
regressions exercise these behaviors. This replaces only the current file;
its imported version remains in private history, and other renderer files
still require independent rights review or replacement.

The current user-prompt transcript row has been independently written around
the existing message props and display-width wrapping helper. Its focused
screen contract checks the prompt marker, continuation indent, wide-character
wrapping, turn spacing, semantic text style, selection fill, and empty prompt.
This change does not resolve the imported Git blob or surrounding transcript
components.

The current `src/components/Markdown.tsx` entry has been independently
implemented from its public props, tokenizer/component contracts, and
screen-level behavior. It dispatches prose, code frames, tables, Mermaid,
display math, and inline math images; it retains theme-driven link repaint,
explicit token-cache opt-out, and the extra spacing after a separated code
block. Streaming/settled cell parity, code-frame performance, math, Mermaid,
and theme hot-swap regressions cover those paths. The imported blob remains
in private history. The formatter in `src/terminal-utils/markdown.ts` and
other surrounding files still require separate provenance review.

The current `src/theme.ts` implementation has been independently rebuilt from
the public theme-token contract and observable CLI tests. Semantic seed palettes
provide the seven built-in themes, while legacy key normalization, user/runtime
resolvers, auto theme selection, brightness detection, and caret contrast retain
their established interfaces. The theme, brand, live theme-switch, preview,
full CLI preflight, staged-package, and clean installed first-run checks passed
on macOS arm64. This is a current-tree replacement only: the old blob remains
in private Git history, other candidate files remain, and Linux/Windows
installation is unverified.

The current `src/ink/reconciler.ts` has also been independently implemented
against React's published host-configuration contract and the CLI's DOM,
focus, event, layout, and paint interfaces. A real React mutation-path
regression now checks mount, prop and text updates, handler removal, focus
cleanup, commit scheduling, and diagnostics. The broader renderer suite and
installed CLI acceptance remain required because that focused check does not
prove every terminal interaction. The original imported blob remains in
private history, and the surrounding Ink files still need source review.

The DOM tree's append, insert, reparent, and removal operations now have a
separately written implementation in `src/ink/tree-ops.ts`. A new contract
check covers DOM/Yoga ownership, in-place ordering, inline text, and removal
of an already painted absolute overlay; renderer, measurement-cache, viewport,
and installed terminal checks remain required. This is a partial current-tree
replacement only: `src/ink/dom.ts` still contains other imported behavior,
and its old full blob remains in private Git history.

Node attribute/style updates, dirty propagation, render scheduling, Yoga
reference cleanup, and debug owner lookup now use the separately written
`src/ink/node-state.ts`. A focused contract checks no-op writes, descendant
invalidation, scheduled frames, visible-row ownership, and subtree cleanup.
This reduces the current-tree imported surface of `src/ink/dom.ts` further;
its node constructors and text measurement remain for review. The private
history still contains the original full file, so this does not clear the
repository for publication.

The tool-call card's structured body projection, line and character folding,
and category colors have been moved into `src/components/messages/toolCardBody.ts`.
The UI still consumes the same protocol views and retains the current terminal
behaviors in focused regression checks. This is an internal separation for a
future independently sourced replacement, **not a source-rights clearance**:
`AssistantToolUseMessage.tsx` still contains imported presentation code, and
the historical card blob remains in private Git history. Before publication,
review the new module's authorship and replace or clear the remaining card
implementation without using the flagged historical source as a template.

The tool-card title presentation now lives in a newly written
`src/components/messages/toolCardHeader.tsx`: it renders localized tool names,
bounded arguments, folded terminal commands, truncation-only hover details,
and clickable file paths. Focused tooltip, agent-view, long-line, and card
completeness checks cover the boundary. At that stage, this reduced but did not
replace the imported surrounding component. It did **not** establish clean-room
authorship: the earlier implementation was available during the change, and
the old source remains in private Git history.

PR #210 replaced the surrounding tool-card component using
its protocol contract, the separate header/body helpers, and terminal-screen
regressions. The pinned screen finds no exact five-line-or-longer block in
the merged component. This narrows the current-tree overlap only; it
does not establish independent provenance of the helper modules or semantic
rights, and the original source remains in private history. Public release
still requires the full review and a separately reviewed history/export plan.

The DOM node/measurement host replacement at `05a7820f36ed7ed2e02b6c5ede2abbf895704813`
reduces its pinned exact-block screen from 383/394 to 10/170 current lines.
The remaining two five-line blocks are type/interface declarations. This is
another bounded review result, not source-rights clearance: related Ink
helpers, semantic similarity, and the imported private Git history still
require review before public release.

The selection-fence wrapper and exported blink hook were reimplemented from
their caller-facing contracts without consulting their imported bodies. The
existing renderer regressions still check selection exclusion, left-edge
selection, focus, and blink phases. Comparing the current replacements with
their immediately preceding private-tree versions finds no contiguous block
of five or more unchanged lines in either file. This only reduces two small
current-source bodies; it does not establish redistribution rights for the
surrounding renderer or the much larger conversation and input components.

The pointer-dispatch portion of `src/ink/components/App.tsx` was replaced at
`c9d465c`, but the pinned screen still finds 1,055/1,057 current lines in one
exact block. The surrounding terminal host remains a major current-source
rights task. The replacement handler and its behavioral tests narrow only
this one portion; neither the rest of the host nor its imported history has
been cleared.

The parsed-input batch dispatch has also been moved into a separately written
`input-batch.ts` module using the parser and host callback contracts. A focused
event-order check and the existing terminal query, keyboard, selection, drag,
and mouse-probe regressions cover the new boundary. The remaining `App.tsx`
host still contains substantial imported material, and the private repository
retains its earlier blobs. This change is not a clean-room or source-rights
clearance; the whole host and the other dominant components remain in the
release review.

## Required resolution

The [current portion screen](UPSTREAM_PORTION_SCREEN.md) verifies exact surviving
line blocks against the pinned import and current main. It shows that several
nominally modified files still retain most of their imported source, especially
the conversation, input, and Ink host components. The screen prioritizes
review; it does not determine rights or clear the current tree or history.
At main `2cfb8719894300741d8a3ea9babc0e36c6da862c`, its current-head
snapshot finds 15,809 of 16,093 exact matched lines in only four files:
`Chat.tsx`, `PromptInput.tsx`, `ink.tsx`, and `App.tsx`. These are the first
source-rights decisions required for the CLI release; replacing more small
leaves alone cannot clear the dominant overlap.

Before making the source repository public or publishing the CLI, inventory
the affected portions and establish rights with defensible evidence, or
replace them using independently sourced/implemented code. Do not use leaked
source as a reference for a replacement. Preserve terminal behavior and the
Harness Agent/session boundary with focused renderer, PTY, staged-package,
and installed-package acceptance. The
[independent terminal handoff](INDEPENDENT_TERMINAL_HANDOFF.md) defines the
separate implementation boundary and observable acceptance inputs; it is not
itself a rights clearance. Track this work in
issue #93 (recorded in the maintainers' issue tracker), under the
broader source-rights gate #86 (recorded in the maintainers' issue tracker).
Deleting a file from the current tree would not remove its old Git blob from
the repository history. Any eventual public source repository must account
for that history as well as the release tree; removing a file now does not by
itself make the existing private repository safe to open.
