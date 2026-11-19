# Notebook environment checks

Official notebook readers now offer **Check environment** in the existing
reader. The result distinguishes available required imports/APIs, missing
dependencies, incompatible SDK APIs and an unavailable interpreter/check.
Preparation guidance is manual, targets a new virtual environment and never
installs packages or changes the active compute configuration automatically.

The probe runs in the selected local or SSH interpreter. It follows the companion
Python import closure and the launcher's literal `run_module` entry, extracts
imports and explicit SDK symbols, and imports dependencies without executing the
research files. Guarded optional imports and type-only imports are excluded.
Unknown module names are not guessed to be package distribution names. Commands
for known missing packages are examples, not a recovered dependency lockfile.

The report records the source snapshot hash, environment revision, runtime
facts, unavailable modules/APIs and the existing 90-second execution limit.
Switching the environment clears the reader's displayed report. An environment
change during the probe invalidates that probe. Import/API availability does not
prove scientific correctness, complete dynamic dependencies, adequate memory or
completion within the execution limit.

Every submission of a project under `notebook-copies/` checks its current frozen
source inputs again, including edits made after creating the copy. A blocker
returns an actionable error before creating a run. Passing submissions retain
the report and use the exact settings checked, even if the selected environment
is changed immediately afterward. Existing non-notebook project execution is
unchanged. The original notebook and editable Python source are not modified
to insert checks.

## Acceptance

- Seven focused backend tests cover a successful import probe without research
  execution, missing dependencies, incompatible APIs, import closure traversal,
  type-only/optional imports, changed source, environment revision races, blocked
  queue submission, retained files, exact checked-interpreter binding and
  same-origin HTTP checks.
- All 212 original notebook bundles continue to pass checksum/source tests.
- The browser test checks environment status and guidance, lost-copy-response
  retry, retained drafts, and the explicit run action. With the older CI-pinned
  SDK, it verifies a missing-synth blocker and zero new runs; with the notebook
  SDK, it verifies a completed run and collected FQX.
- The real SDK acceptance script runs superposition, QAOA and molecule
  eigensolver through the actual service, confirms the preflight/source binding,
  replays each saved circuit and then adds a missing import to the editable
  project. The second submission must be blocked without a duplicate run or
  loss of the edited source. Results are recorded in
  `notebook-environment-sdk-2026-11-19.json`.

Run the focused checks using the interpreter and SDK setup described in
`OFFICIAL_NOTEBOOKS_2026-11-19.md`:

```sh
PYTHONPATH=packages/quantum-workspace/local python -m unittest discover \
  -s packages/quantum-workspace/tests -p 'test_notebook*.py' -v
PYTHONPATH=/path/to/pinned-sdk MPLBACKEND=Agg \
  python packages/quantum-workspace/tests/notebook_sdk_acceptance.py
FQ_NOTEBOOK_SDK=compatible FQ_LOCAL_PYTHON=/path/to/python \
  PYTHONPATH=/path/to/pinned-sdk MPLBACKEND=Agg \
  node apps/web/scripts/run-e2e.mjs notebooks.spec.mjs
```

These checks use isolated local projects and make no model calls.
