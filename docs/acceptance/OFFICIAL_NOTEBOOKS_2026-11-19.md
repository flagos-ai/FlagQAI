# Official notebooks in the research workbench

The existing Model → Examples library includes 212 native notebooks pinned to
FlagQuantum `fb7c05184085f829f282780618014001a3da1714` (PR #1224). The older
program-only synthesis catalog keeps its independent source revision and evidence.

## User workflow

1. Open **Official notebooks** and browse the original directory hierarchy or
   search by title, path and documented scope. Three representative workflows
   are also offered directly: superposition, QAOA and molecule eigensolver.
2. Read Markdown, mathematics and Python cells. The reader verifies the original
   notebook checksum before displaying it. Raw HTML and historical rich outputs
   are not executed or mounted. Download retains the original notebook bytes.
3. Select **Create research copy**. This creates a separate project containing
   the official Python entry and its example import dependencies, pinned input
   data, original notebook, source manifest and upstream licenses. Existing
   editor drafts remain available. A lost creation response can be retried in
   the reader using the same request identity; edited copies are never replaced.
4. Review the source in Projects, select and check the compute environment, then
   explicitly run `run_notebook.py` with the existing Python run control. Nothing
   runs or installs when browsing or copying. Required imports are listed under
   **Scope and environment**; upstream evidence does not certify today's runtime.
5. Inspect actual stdout, errors and collected FQX files in the existing run and
   result surfaces. Continue editing and running the project through the normal
   frozen-source snapshots, comparison and reproduction flows.

## Execution and evidence boundaries

This is a reader plus companion Python project execution, without an interactive
cell kernel or persistent notebook variables. The official documented Python
entry runs as a module, preserving relative imports. Generated input modules
restore pinned CSV/JSON/NumPy bytes inside the isolated run directory; the project
manifest records their original hashes. Each project remains within the existing
64-file, 32-KiB per-file and 512-KiB source limits.

The launcher captures the last successful `fq.run` result during a successful
workflow and saves `last-observed-run.fqx`. It restores `fq.run` in a `finally`
block. That archive represents an observed circuit execution, not necessarily an
optimizer's best candidate. Scientific conclusions belong to the workflow output.
Workflows without `fq.run` do not receive an invented archive. A failed workflow
retains normal errors and any artifacts it saved itself.

The existing 90-second execution limit and FQX collection/preview limits apply.
Long examples may require a local SDK checkout. Arbitrary plot files are not
newly collected. This integration does not claim execution acceptance for all
212 workflows, universal dependency compatibility or optimization convergence.

## Acceptance

On 2026-11-19, local acceptance used the pinned SDK checkout with Python 3.12,
PyTorch 2.10, NumPy, SciPy and Matplotlib, with no model calls. All 212 notebook
and companion-bundle checksums were verified and their Python files compiled.
Focused tests also covered input restoration, bounded snapshots, duplicate copy
requests, edited-copy conflicts, invalid paths, symlinks and changed checksums.

Three complete workflows passed through the actual `PythonRuns` service. Each
created one project, ran once, collected an FQX result and independently replayed
its saved circuit with matching statevector (`atol=1e-10`, `rtol=0`). The portable
report is `official-notebooks-sdk-2026-11-19.json`. QAOA completed its configured
iteration budget with improved objectives but reported `converged=False`; this
is a successful execution, not evidence of convergence or a global optimum.

Browser acceptance checked desktop and narrow reader layouts, no implicit
execution, a lost copy response followed by retry, refresh with retained scratch
draft, and explicit Python execution with a source-bound collected artifact.
The default CI SDK pin predates `synth`; its browser run instead checks the
explicit missing-module failure with the editable project retained. Set
`FQ_NOTEBOOK_SDK=compatible` only for the pinned notebook SDK success probe.

Regenerate and validate explicitly with an SDK checkout at the pinned revision:

```sh
python apps/web/scripts/notebooks/generate.py /path/to/pinned-sdk
PYTHONPATH=packages/quantum-workspace/local python -m unittest discover \
  -s packages/quantum-workspace/tests -p test_notebooks.py -v
PYTHONPATH=/path/to/pinned-sdk MPLBACKEND=Agg \
  python packages/quantum-workspace/tests/notebook_sdk_acceptance.py
node apps/web/scripts/build.mjs
FQ_NOTEBOOK_SDK=compatible FQ_LOCAL_PYTHON=/path/to/python \
  PYTHONPATH=/path/to/pinned-sdk MPLBACKEND=Agg \
  node apps/web/scripts/run-e2e.mjs notebooks.spec.mjs
```

Install the workflow's documented dependencies in that interpreter first. Set
`MPLCONFIGDIR` to a writable cache directory if needed. The SDK acceptance script
creates only temporary projects and emits its report to stdout. None of these
commands submits a model request or changes an existing research project.
