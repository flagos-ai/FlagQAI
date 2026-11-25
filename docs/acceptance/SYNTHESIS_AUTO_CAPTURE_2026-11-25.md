# Automatic synthesis circuit collection acceptance

Date: 2026-11-25 (Asia/Shanghai)

## Result

The original `applications/cfd/qlbm/main.py` runs unchanged through the Python
task service and produces a usable archived circuit and its actual execution
result without an explicit `fq.save` in the source.

| Property | Observed value |
| --- | --- |
| Source SHA-256 | `5b5a58ee3aa8d71c8907487873c9c2f13d67bf6d42efa68c1cb3ec7fac17dc3b` |
| Run ID | `6cf3cd82-19a2-4936-a3ef-51cffd0e92d3` |
| Experiment ID | `fqx-69f972a6b81445ab8a7e1279d13f7fdf` |
| Archive SHA-256 | `92fb926c54f471b92f67e988d34be453350d79c9efb1bb18fc7b651e50fad2b1` |
| Qubits | 19 |
| Operations | 3,316 |
| Depth | 2,770 |
| Result | Actual returned SDK result retained |
| Script execution | Completed |
| Collection | Completed |
| Paid model calls | 0 |

The isolated local acceptance directory is
`.flagqai/acceptance/synthesis-auto-capture-2026-11-25/local-monitoring/`.
It retains `acceptance.json`, `run.json`, `experiment.json`, the input snapshot,
SQLite run/experiment records, and the original collected FQX archive. The earlier
profiling implementation's acceptance records remain in the parent directory.
The final implementation uses Python 3.12 local monitoring events on three SDK
functions, avoiding observation of every Python function call.

The existing configured SDK/runtime was used: SDK source snapshot
`0c88d5af9cd1f9dd0d39dca8d54309199c81c086`, SDK 0.4.0, Python 3.12.14.
This is not a clean-install or all-notebook acceptance claim.

## Behavior and boundaries

- The task adapter observes successful returns from SDK synthesis, execution and
  saving. It leaves the SDK functions, their signatures, source locations and
  implementation fingerprint unchanged.
- It serializes the synthesis product's existing checked execution plan and the
  actual returned result. It never executes the plan again to populate the UI.
- A successful explicit archive of the same SDK object, unchanged since saving,
  takes precedence when it retains the available result. Deleted, changed, external or
  circuit-only explicit files cannot discard an available automatic result.
- Automatic records retain the original Python source/run/hash and project
  dependency provenance. The resource pane labels automatic versus explicit
  collection and circuit-only versus recorded-result archives.
- A subsequent script failure preserves already-generated circuits and their
  failed execution origin. Capture errors retain the Python exit status and
  are reported separately as collection errors.
- Capture remains bounded to eight products, 16 MiB per file and 32 MiB per run.
  Preview supports at most 256 qubits, 10,000 operations, 512 KiB exported
  OpenQASM and a 2 MiB projected response. Execution limits are unchanged.
- Notebook kernels, external processes, interrupted tasks and SDK entrypoints
  outside the observed functions are not claimed to have automatic collection.
  Older interpreters use a profile-based compatibility path; an existing profiler
  is not replaced when that fallback would conflict.

## Validation

- Real subprocess tests cover unsaved synthesis/result capture, multiple products,
  later script failure, explicit-save precedence, deleted/external explicit files,
  keyword plan execution, unchanged SDK introspection and capture-error isolation.
- Original QLBM execution checks all three resource counts and saved result data.
- Browser tests run the original QLBM, open its hierarchical circuit, retain the
  source, mark an edited source as a different version and submit only one run.
- Existing constraint-verification and compiler-optimization examples still save
  exactly their explicit archives and support comparison and source provenance.
- Related Python/FQX regression suite, frontend unit tests, TypeScript, Web build
  and staged CLI package verification pass. These paths make no model calls.

The 4188 Web service was restarted with its existing launch settings and database
paths after checking for active tasks. Compute selection remained at revision 2;
persisted Notebook rows were byte-identical before and after restart. The native
Agent service was not restarted, and no user source was edited or submitted.

Validation counts: 42 related Python/FQX tests passed in the full targeted suite;
three subsequent focused checks cover external-save handling and explicit/deleted
archive precedence. All 340 frontend unit tests and five focused browser cases passed, including
real-SDK QLBM, constraint-verification and compiler-optimization executions. Changed frontend files pass Prettier; the broader Web format command still
reports an existing formatting warning in generated `src/data/notebook-catalog.json`,
which this change does not modify.
