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
