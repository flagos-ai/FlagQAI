# Stateful notebook cell workspace

Open **Model → Notebook** beside the Python and OpenQASM controls. The notebook
occupies the main editor, with the official notebook selector beside the mode
controls. The last selected notebook and mode survive refresh; switching modes
or notebooks preserves their independent drafts. Python/OpenQASM controls and
output panels are hidden while Notebook is selected, and their panel sizes remain
unchanged. Selecting a model or project file returns to its source editor.

The **Examples → Official notebooks** reader also opens the same main editor via
**Open notebook workspace**. The reader and existing project-copy workflow remain
available. Opening a workspace creates a separate editable copy; it does not run
code or replace the Model editor draft.

The selected **local** Python environment needs `jupyter-client` and `ipykernel`.
The acceptance versions are pinned in
`packages/quantum-workspace/tests/notebook-runtime.txt`; install those dependencies
in the selected environment before running. Each example also needs a compatible
FlagQuantum build and its scientific dependencies. Kernel startup failures report
the missing runtime rather than switching interpreters. Interactive SSH kernels
and isolated macOS execution are not supported by this workspace yet.

## Interaction and persistence

- Edit code and Markdown cells; add, reorder, delete and vertically resize them.
- Markdown initially renders as a document with headings, bold, emphasis, lists
  and math. Edit or double-click to show its source; Done or Shift+Enter returns
  to rendering, without displaying duplicate source and preview. Its edit toolbar
  inserts bold, italic, heading and inline-code markup at the native selection.
- Code cells show Python syntax colors while preserving native textarea
  selection, IME input and vertical resizing. Tab/Shift+Tab indent and dedent;
  Ctrl+/ or Cmd+/ toggles comments. Highlight layers follow both scroll axes;
  forced-color mode uses native text instead. Cell actions and notebook controls
  use compact toolbars, and empty execution output panels are omitted.
- The cell actions menu inserts code/Markdown cells, duplicates source, splits at
  the last cursor position, merges adjacent cells of the same kind, and moves cells.
  Undo/redo restores source and structure without rerunning code. Typing is grouped
  by cell and a short pause; 50 edit groups are retained until this editor closes.
  Execution history is independent of edit undo.
- Completion suggestions combine the current document's identifiers with the idle
  IPython kernel. Ctrl+Space requests completion; Ctrl+Shift+Space requests parameter
  help. These use kernel completion/inspection messages, never execute requests,
  and do not start a stopped kernel. Tab/Enter accepts, Escape dismisses. Cursor
  offsets translate between browser UTF-16 and IPython Unicode code points.
- Run one code cell with its button or Shift+Enter. Run all executes code cells
  in document order, stopping at the first error. Variables persist between runs
  in the same real IPython kernel. The cell menu can run through the current cell
  or from it to the end; queued/running/completed states remain visible per cell.
- Outputs include text, images, JSON and tracebacks. Active HTML, SVG, JavaScript
  and interactive widgets are not rendered. The kernel supports no stdin prompts.
- Save writes the document with a revision check. Each execution freezes the
  selected source and revision. Changed code and previous-kernel output are labeled;
  execution history retains earlier failures and output.
- Browser drafts and pending execution IDs survive refresh. A lost execution
  response is reconciled with persisted history; explicit retry uses the same ID.
  Reopening or reconnecting never runs a cell automatically. Concurrent saves
  reject stale revisions and retain the local draft.
- Interrupt stops the active calculation. Restart releases the kernel; its next
  execution starts a fresh namespace. Service restart preserves saved cells and
  outputs, marks unfinished executions interrupted, and never restores variables
  or replays code automatically.
- The More menu imports Python `.ipynb` v4 files as independent, content-identified
  copies. Reimporting the same file opens its saved copy; it does not execute cells
  or overwrite the previously open draft. Imported metadata, Markdown attachments,
  raw cells and original outputs are preserved across save/export. Active HTML,
  SVG and widgets are archived but not rendered. Companion files are not uploaded;
  users must provide those separately in the notebook working directory.
- Imported outputs are explicitly labeled unverified in this environment. Editing
  source marks retained outputs as previous. Fresh execution replaces the displayed
  output while the original imported cell remains archived. Download exports the
  current cells with matching execution results, falling back to archived imported
  output when no matching execution exists. It never overwrites the original file.

Documents and executions use sibling SQLite stores beside the existing workspace
database. Notebook support sources and generated files live in the per-notebook
`notebook-workspaces/<id>` directory beside that database. An explicit data
preparation cell restores pinned input files when an example needs them. Notebook
validation-only imports are included in the verified companion bundle. Results
written with `fq.save` persist there; they are not automatically imported into Jobs.

The initial bounds are four open kernels, 1000 cells per notebook, 32 KiB source
per cell, 512 KiB document source, 90 seconds per cell and 1 MiB/2000 output events
per cell. Import/HTTP request payloads are limited to 1 MiB. A timeout terminates the kernel. These are local execution limits, not
claims that every scientific workflow fits them.

## Validation

`test_notebook_sessions.py` exercises real kernel state across requests, error
stop, interruption, service recovery, duplicate execution IDs, revision conflicts,
cross-cell FlagQuantum execution and FQX save/load, and pinned data preparation.
`notebook-workspace.spec.mjs` uses a real kernel in Chromium to verify text, dict
and Matplotlib output, a response lost after receipt, exactly two executions after
refresh, unsaved cell and Model editor drafts, kernel restart, and `.ipynb` export.
The existing reader/project-copy browser acceptance remains enabled.

The unmodified official **Superposition in native FlagQuantum** notebook was also
run through all seven code cells using the pinned compatible source checkout
`fb7c05184085f829f282780618014001a3da1714` in the local test environment, including its independent state comparison.
This is a representative complete workflow, not an execution claim for all 212
notebooks. No paid model calls are involved.

## Daily editing acceptance

- 317 frontend tests, TypeScript check and production build passed.
- Nine real-kernel tests cover import persistence and validation, inspection and
  completion without additional executions, plus the existing recovery cases.
- Seven Chromium scenarios cover edit undo/redo, split/merge, import/export metadata
  and attachments, refresh and independent drafts, kernel completions, parameter
  help, ordered partial execution, and the existing library/recovery flows.
- Staged package surface verification passed; no paid model calls were made.


## Companion import regression

The notebook-cell dependency scan now resolves package imports and their aliases
with the same resolver as companion Python files. The cooling-system notebook
requires `full_model.py` only from a notebook cell; the telecom AMD workflow also
requires two reference helpers not reachable from its entrypoint. These three
missing files are now vendored from the unchanged pinned SDK revision.

- Audited 2,024 resolved local imports across all 212 notebooks and companion
  sources against the pinned checkout. All required modules are present; this
  is dependency coverage, not full scientific execution of every notebook.
- Seven bundle/resolver tests and ten real-kernel session tests passed, including
  the unmodified cooling import cell and source-location verification inside
  the bundled workspace.
- The recovery regression deletes a previously missing helper, restarts the
  session service and reruns the import. The helper is restored while edited
  Python files, notebook source, run history and a result artifact remain intact.
- Seven environment tests, the focused Chromium cooling-import scenario and
  staged package verification passed. Production assets were rebuilt, and the
  local port 4188 serves the corrected bundle.

Existing kernels need an explicit restart before their next cell execution can
seed newly supplied helpers. Restart does not execute cells or remove saved
source, outputs or workspace artifacts; in-memory Python variables are reset.
No paid model calls were made.

## Active Notebook Agent context

The active Notebook supplies lightweight document identity in message controls.
Ordinary questions do not automatically attach code. For relevant questions,
the Agent is directed to inspect the latest draft through the native workspace
bridge. The bridge retains unsaved cell sources and bounded execution summaries,
with source/kernel provenance and explicit truncation markers.

The editor toolbar's **Reference in chat** stages a document snapshot for the
next message without sending it. The existing `@` picker also supports explicit
Notebook references. Users can remove staged references before sending.

Notebook snapshots use a distinct document language and cannot be shared as an
executable Python/QASM model. Switching documents waits for the bridge to publish
the matching context before enabling Send. Previously sent and pending messages
retain their original snapshots. This does not add Agent cell editing or cell
execution tools; users still execute cells through the Notebook workspace.

- A Chromium regression keeps a Shor source in the hidden editor, opens Cooling,
  edits an unsaved cell and inspects the actual outgoing message. Cooling and its
  current source are included only after explicit reference; ordinary questions
  contain identity without a source attachment. Shor and its linked file are absent.
- Switching Notebooks, refreshing and returning to Python preserves Notebook,
  Python and chat drafts. The pending message remains unchanged and no Notebook
  execution is submitted. Notebook sessions are scripted in this context test;
  no scientific execution or live model response is claimed.
- 320 frontend tests and 13 bridge tests passed, including Notebook context
  inspection and rejection of sharing a snapshot as executable source.
- TypeScript, production build and staged package surface verification passed
  (2,671 files / 32 entry targets). No paid model calls were made.


## Notebook document design

The Notebook workspace now uses a document header with cell count, saved-copy or
local-change state, and an explicit Python kernel indicator. Commands are grouped
by editing, execution and kernel control; file operations and shortcut guidance
remain in More. Reference stages a snapshot in chat without sending a message.
Narrow panes use labeled icon controls and wrapping document navigation.

Rendered Markdown follows a continuous document rhythm with quiet cell controls.
Code cells use a consistent surface, synchronized line numbers and syntax paint,
and a single subtle focus border. Textarea selection, IME input, shortcuts and
vertical resizing are unchanged. Outputs remain attached to their source cell,
with a separate output heading, bounded scrolling, vertical resizing and fitted
images. Earlier-code and earlier-kernel provenance remains visible. Execution
history retains all receipts and errors in expandable rows.

Acceptance covers the real local IPython kernel, Markdown editing, syntax and
line-number scroll alignment, completion and parameter help, partial execution,
independent imports, refresh and receipt recovery, draft retention, explicit chat
references, provenance and image fitting at wide and narrow viewport sizes.
No paid model calls are used.

### Compact document header

The document identity and command groups share a row when the Notebook pane has
enough room. The header wraps according to pane width, so manually resized panes
remain usable. Secondary command labels collapse to icons in narrower panes;
accessible names and tooltips retain the full command names. Long document titles
truncate with their full name available on hover. No commands were removed.

Chromium acceptance checks the single-row header at a 1,920 px viewport, with a
maximum height of 64 px, and checks command overflow and output fitting at 1,440
and 1,000 px. All 10 Notebook browser scenarios and 320 frontend tests passed,
along with TypeScript, production build and staged package surface verification.
No paid model calls were made.

### Searchable notebook picker

The native catalog select is replaced with a bounded popover using the workbench
theme. Its trigger shows the document title; results group titles by category and
show source paths as secondary text. Search matches titles and paths, the selected
document has a checkmark, and generic overview titles use the parent folder name.
Imported copies remain selectable while active. Unavailable entries retain their
reason and cannot be opened.

The search receives focus on opening. Arrow keys move through available results,
Enter selects, and Escape dismisses and returns focus to the trigger. Clicking
outside or leaving the picker closes it. Selecting a document never executes code.

All 11 Notebook browser scenarios passed, covering popup bounds at 1,440 and
1,000 px, search and keyboard interaction, draft retention across selection and
refresh, imported copies, explicit Agent references and real local cell execution.
All 320 frontend tests and staged package verification passed. No paid model calls
were made.

### Original synthesis repository tree

The Examples library mirrors `examples/synthesis` at FlagQuantum revision
`0c88d5af9cd1f9dd0d39dca8d54309199c81c086`: 2,679 tracked files,
including 1,318 Python files and 212 notebooks. Folder names, filenames and bytes
are preserved. Python files open directly in the Python editor; notebook files
open directly in the Notebook editor. Other files have a read-only preview and
original download. Search retains the matching directory hierarchy, and folder
expansion survives refresh.

Notebooks retain their original cells and metadata. Opening a file does not run
code or insert a preparation cell. Explicit execution prepares missing pinned
inputs from the snapshot, verifies their hashes and preserves existing input
files. Companion implementation sources and their SDK references remain
available in the existing source viewer.

Each original notebook opens a source-bound independent saved session. Reopening
that file restores its session and local draft. Existing saved sessions, previous
expanded copies, Python drafts and execution history are retained. The cooling
expansion builder is an offline utility; the deployed cooling notebook is the
unaltered upstream file.

Acceptance covers byte and size checks for every mirrored file, direct opening of
large Python files, original notebook cells, refresh and file-switch draft
retention, local kernel execution and existing notebook editing interactions.
The SDK test separately exercises the offline cooling builder; it does not imply
that all 212 original notebooks or all 1,318 Python scripts have been executed.
No paid model calls were made.
