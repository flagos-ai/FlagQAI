# Compact editor layout

File identity, synchronization status and file actions share the editor's action
toolbar. The pane title, project access, language controls and focus action remain
available. Project tabs retain their separate file-navigation row. Narrow layouts
wrap controls rather than removing actions; conflicts retain their full message.

Python output offers explicit compact/expanded modes. Existing height preferences
are respected on startup; there is no automatic collapse on completion. Compact
mode uses 112 pixels, retains status and saved-experiment links, and hides logs
until expanded. Stop, import and run-detail controls remain available. Errors and warnings remain visible.
The compact header stays accessible while scrolling its contents.

Mode preference is independent of the existing `fq-pane-layout-v1.errors` height.
Expanding restores that exact saved height. Pointer or keyboard resizing exits
compact mode and records the user's new height using the existing separator and
layout mechanism. OpenQASM diagnostics keep their existing sizing behavior.

Browser acceptance verifies file actions, additional editor space, full/compact
mode across reload, restoration of saved heights, keyboard and pointer resizing,
and narrow toolbar overflow. Existing Agent review and execution journeys remain
part of complete regression acceptance.

The Models sidebar groups import/search controls and renders examples and saved
models as compact two-line rows. Names and descriptions wrap at the existing
170-pixel minimum sidebar width; font sizes and import limits are unchanged.
Project and template panels retain their own spacing. Browser coverage checks
the example group's height, narrow-sidebar overflow, search, and import behavior.

The circuit visualizer combines program identity, provenance time, Info, gate
reference, SVG download, focus, and execution actions in one adaptive header.
Logical/Compiled, Tree, zoom, and Fit share a second toolbar with native selectors
for hierarchy detail and qubit/register display. Native selectors retain keyboard
navigation and dismiss outside without custom overlay behavior. Resource metrics
and gate colors remain available below the controls. Narrow layouts wrap controls;
the zoom group stays together. Existing circuit zoom and panel-size persistence
remain unchanged. Browser acceptance covers all detail levels, both wire modes,
focus/restore, pointer and keyboard information-panel resizing, narrow overflow,
and Fit/manual zoom behavior.

The Agent dock combines its identity/model selector, connection indicator, new
chat, history, settings, and library return into one adaptive header. Icon actions
retain accessible names and descriptive tooltips. Backend selection lives in the
Models and providers dialog with its existing active-session lock. Connection and
recovery states, pending decisions, and compaction retain a visible secondary
status line when relevant; normal connected/working sessions use one header row.
Delivery warnings, errors, conversation state, drafts, and input controls are
unchanged. Browser acceptance covers header height, narrow overflow, settings and
history access, native decisions/reconnect, streaming, and draft protection.

Jobs rows combine name/time and status/resources into two lines at normal sidebar
widths. Full names remain in accessible labels and hover titles; selection roles
remain visible, and narrow rows wrap summaries instead of overflowing. Search and
status filtering share a row when space permits. The comparison footer retains
its explicit two-selection requirement and clear action without a permanent
instruction row. The result page uses a compact identity header, inline metrics,
and one adaptive distribution-control group. Results/Circuit/Code, measurements,
batches, units, sorting, state search, complete-data export, pagination, recorded
state, and provenance remain available. Browser acceptance verifies compact
geometry and narrow overflow alongside existing result/comparison and pagination
journeys; data selection, normalization, and execution behavior are unchanged.

Execution combines the program identity/source kind and Run action into one
header. Shots and job name stay visible; random seed lives in Advanced options,
whose collapsed summary always shows the current seed. Explicit toggling saves
the expansion preference immediately. Invalid seeds reveal the field, and all
existing numeric limits still gate Run. Runtime/backend limits use a separate
collapsed disclosure. Snapshot safety text and the switch to the current Model
draft remain available without repeating the program name in another card.
Job name now round-trips with existing shots/seed preferences; live submissions
and transient execution targets are still not restored. Existing sidebar width
and drag/reset behavior are unchanged. Acceptance verifies settings/expansion
across reload, validation, actual snapshot execution with 64 shots and seed 7,
narrow layout, pointer resizing, and retained editor drafts.

Synthesis replaces introductory copy with a compact source/action toolbar,
compiler status, and saved resource summary. The workspace hook tracks the actual
in-flight compile source independently of generic busy state. Results match the
current source exactly; older same-name compilations are explicitly labeled as
previous resources, and a failed retry never promotes saved resources to a new
success. Python files link to Run Python in Model, while existing Python circuit
artifacts can still be opened. Successful compilation retains the existing
navigation to Quantum, and returning to Synthesis shows its persisted resources.
Compiler/environment explanations are folded into the sidebar; width drag/reset
behavior is unchanged. Acceptance covers real OpenQASM compilation, held-request
status, source changes during compilation, failure/retry feedback, result access,
reload, narrow layout, and preserved drafts.

Quantum's library uses compact snapshot rows with name/time, qubits/depth, and
saved-result availability. Full identity and timestamp remain in hover text and
accessible labels; narrow rows wrap metadata without overflowing. Upload and its
limits remain available. Program information now presents resource metrics before
archive metadata. Explicit Info/close actions persist under
`fq-program-info-open-v1`; switching programs or refreshing restores that choice.
Selecting a gate/module/measurement can temporarily reveal details without
replacing the saved choice. Focus mode also leaves the saved visibility intact.
Existing information width and summary/detail height keys, drag controls, keyboard
adjustments, and reset behavior remain unchanged. Browser acceptance covers both
visibility choices across selection/reload, inspection reveals, focus, pointer
resizing, narrow rows, and retained editor drafts.

Experiment comparison uses one action toolbar and places observed operation and
distribution differences above the experiment cards. Each card shows selected
measurement/results before its circuit preview. Compact preview spacing is the
default; Expand/Compact previews restores the former spacing without changing
gate glyph sizes, operation limits, horizontal scrolling, or full-circuit access.
The preview preference persists independently in `fq-comparison-previews-v1`.
Six-wire compact previews scroll vertically when needed. Source/provenance and
original downloads remain in each card, and the complete sortable/paged state
table follows the cards. Compatibility warnings, complete-count normalization,
and interpretation caveats are unchanged. Existing comparison acceptance checks
first-screen outcomes, preview preference reload, narrow overflow, provenance,
swapping, and complete 64-state comparison pagination.
The state table's scroll viewport contains its visually hidden caption so the
accessible table name cannot extend the outer document into a blank scroll area.

Execution's backend sidebar reads the configured adapter identity and transport
from `/api/health`, with explicit checking/error states and a read-only refresh
action. Unknown adapters retain their reported identifier rather than being
relabeled as PyTorch CPU. Failed refreshes identify cached metadata as the last
received details; startup failures show unavailable metadata, not a false
connection claim. Connection verification still occurs during compilation/run.
Limits and details are folded by default and their explicit expansion choice is
saved independently. Reported qubit/shot caps are shown as received; the known
CPU adapter retains its existing service-limit explanation. Runtime explanations
are consolidated here instead of repeated in the main form. Existing sidebar
drag/keyboard/reset behavior remains unchanged. Acceptance covers local/SSH/custom
metadata, unavailable/recovered reads, limit/width persistence, and retained model
code alongside the real Execution journey.

Shared control presentation lives in `src/controls.css`, scoped to the workbench.
Toolbar controls use 28px height, standard actions use 32px, and form controls use
36px. Shared radii, select chevrons, modal headers/footers, and action spacing
reduce page-to-page variation. Native select behavior is retained. Agent header
controls, project-tab close buttons, navigation/list rows, code editors, and SVG
circuit glyphs keep their specialized density and hit areas.

`Modal` provides a common surface with standard padding, title, footer, and close
control presentation. Gate reference and Quick Open use a flush layout so their
internal scrolling and split panels remain intact. Outside-click dismissal,
Escape/IME handling, initial focus, and focus restoration are unchanged. Existing
pane drag/keyboard sizing and saved layout preferences are independent of this
presentation layer.

Text-field and native-select focus uses a single subdued border color rather
than an offset outline plus shadow. Agent composition and Jobs search indicate
focus on their enclosing boundary, with no inner input outline. Code editing,
checkbox/radio/range indicators, button focus, and keyboard behavior are retained.

Model's idle Agent-sharing explanation is a button tooltip rather than persistent
status text; actual sync/conflict/error states remain visible. Code search and
file search keep their commands and shortcuts with distinct glyphs. Python output
imports are available from an upload icon in its header; the former import-only
action row is absent without a run. Stop, recovery, run details, result actions,
manual height, and compact/expanded output behavior remain unchanged.

Quantum information prioritizes metrics, the saved-result action, and the source
match/mismatch indicator. Source/file provenance and export actions remain in an
expandable metadata section. The summary/detail separator and saved dimensions
are unchanged. Browser acceptance opens metadata before checking original archive
identity and verifies both its collapsed state and available result action.

Read-only model configuration uses selectable, wrapping label/value text instead
of editable-looking input boxes. Editable shots and seed controls are unchanged.
The Python save/load guide and example loader remain under Save experiments;
interpreter paths wrap at the available panel width.

Agent completion keeps the actionable experiment outcome outside the work fold.
Tool/thought progress, todos, subagents, workspace experiment activity and page
changes share the completed turn's Worked summary. The nested experiment activity
starts expanded inside that fold, retaining exact run/file/result navigation and
recovery actions. Live activity remains available during execution; completed
successful activity uses lighter timeline boundaries, while problems keep their
emphasis. The turn fold is also available for workbench-only actions.

For a connected Agent, the header status dot opens connection details, including
reconnect, provider settings and chat-draft actions; it replaces the footer link.
The existing one-click Connect action and disconnected Connection fallback remain
available. Connection details use the shared modal dismissal/focus behavior and
provider settings replace that modal rather than stacking over it. Context,
auto-compaction, subagent and Follow Agent controls retain their behavior.

Jobs uses a summary metric for one measurement; multiple measurements or batches
retain their selectors and independent selection handlers. Completed library rows
keep status as accessible text and hover information, with visible emphasis on
exceptional states. Narrow library widths hide the clock while preserving the
full timestamp in row hover text. Comparison checkboxes, roles and resource data
remain available. Small unfiltered charts omit repeated state/count totals below
the plot. Filtered/paged ranges remain visible, qubit order remains visible, and
How to read expands the complete key/normalization explanation. Data, exports,
normalization, pagination and manual panel dimensions are unchanged.


Real-model acceptance exposed native injected context messages advancing the raw
workspace turn anchor while the projected human row kept its earlier sequence.
Injected messages now leave the human anchor intact. Existing actions tagged by
those context sequences are associated with the enclosing human-message interval,
without changing native rows or reprocessing tools. Regressions cover multiple
human-turn boundaries, invalid/unknown sequences and injected-context timing;
the existing paid session was reviewed again without another model call.


Recovered experiment tasks now distinguish the latest submitted run from earlier
run issues. A completed native turn with a later successful, fully collected
saved result can show Experiment ready while preserving earlier failed,
cancelled, timed-out or collection-error attempts in expandable history and
Worked for. View run opens the exact historical output without submitting code
or changing the editor draft. An active retry, incomplete/unavailable metadata,
a latest failed run, an unknown/partial collection, or no saved result cannot
establish recovery. Run-read failures and manual-action errors remain separate.
The recovery state also permits the existing one-time requested comparison after
successful recovery; it never reruns a model or a Python process.
