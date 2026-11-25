# Compilation within the editing workspace

The independent Synthesis navigation item and page are removed. Compilation
results now belong to the current Model editing workspace, beside its existing
output or diagnostics. The source editor remains visible while users compile,
inspect saved circuit resources and review recorded synthesis evidence.

## Behavior

- Model's OpenQASM Compile action stays in the editing workspace and selects
  Circuits & resources on successful completion. Opening the full circuit is an
  explicit action. Existing external compilation callers retain their original
  navigation behavior.
- A compile finishing after the user switches pages does not steal that page
  or its selected circuit. A newer editor draft is not replaced or treated as
  the compiled version.
- Python continues to use Run Python. Synthesis constraints remain in the
  actual Python source; the environment panel does not invent or override SDK
  options. Saved circuits are matched using the selected run ID, executed
  source, source hash and archive digest.
- Project dependency changes prevent a matching entry file from being labeled
  current. Historical resources remain inspectable with a saved-version label.
- The existing run-history selector remains available in the results header.
  Multiple saved archives expose their actual qubit, depth, instruction and
  explicit T/Tdg counts. Two archives can open the existing full comparison.
  Recorded verification, source provenance and export remain available through
  their existing circuit and result views.
- Notebook keeps its native cell editing and execution outputs. It does not
  acquire results from a hidden Python draft. Switching through a legacy
  synthesis link retains Notebook edits and the independent Python/chat drafts.
- Constraint verification, optimization and harmonic-grid examples move into
  the existing Templates library. The pinned upstream file tree is unchanged.
- Legacy `#synthesis` links normalize to `#model` with Circuits & resources
  selected. The selection is part of the complete workspace backup and survives
  refresh.
- Circuit resources have their own remembered height, initially 260 pixels.
  Output's compact mode and manually adjusted height are retained independently.
  Existing resize controls and editor positions remain available.

## Verification

Frontend tests cover legacy-link migration, complete-backup persistence,
in-place completion, navigation during compilation, changed source snapshots,
archive-digest binding and changed project dependencies. Real-SDK browser
scenarios cover two saved synthesis variants, source edits, resource comparison,
optimization evidence, original example execution, reviewed compilation,
failure/retry visibility, refresh and independent pane resizing.

Validation passed: 340 frontend tests, TypeScript, production build and all
97 Chromium scenarios in one run with zero retries. The browser run uses the
existing real local SDK environment and scripted native Agent fixture. It
includes the complete QAOA research/export/import/reproduction flow, plus
legacy-link navigation while independently edited Notebook, Python and chat
drafts are retained without an execution submission.

Browser work uses isolated temporary services and storage. The current user
workspace is not cleared, and opening a view does not submit code. No paid
models, SDK modifications or new backend execution paths are involved.

The prior 212-notebook execution report and all retained attempts remain intact
in `NOTEBOOK_CORPUS_2026-11-24.md` and its linked machine-readable reports.
