# Model run result experience acceptance

Date: 2026-11-25 (Asia/Shanghai)

## User path

Python execution stays in the user's selected output tab. Once source-bound
circuit previews are available, Output shows a compact result summary with actual
qubits, operations and depth, a direct circuit-view action and resource details.
Multiple products show their count rather than arbitrarily selecting one as the
answer. Changed source is labeled as a previous source version. SDK-backed
compilation and execution phases are reported from observed function calls, not
inferred from Python text; generic Python retains its ordinary running state.

Complete file/result actions remain under an expandable disclosure. Collection
or preview failures reveal it automatically; a successful recovery keeps it open.
User expansion choices survive navigation within the browser session. Research
record actions, failure details and retained-file recovery remain available.

The circuit toolbar provides **Back to code**, which returns to the active draft
without loading an archived source over it. Existing editor position persistence
restores the editor. Output records the selected run's log scroll position and
whether the user follows the latest output, retaining up to 30 run views in
session storage. New logs do not pull a reader away from older output. The latest
output action still resumes following. Manual pane heights and compact output
preferences retain their existing storage and behavior.

## Validation

- Real QLBM source yields 19 qubits, 3,316 operations and depth 2,770.
- A QLBM user-path test adds explicit diagnostic lines to exercise log scrolling,
  then keeps an unsubmitted code iteration. Viewing its circuit, returning and
  refreshing retain that draft, the editor reading position, log position and
  manually adjusted output height. Only one Python run is submitted.
- Existing tests cover original unchanged QLBM capture, historical result/draft
  restoration, live-output follow controls, compact output/manual sizes, preview
  recovery without rerunning, hierarchical circuit ranges and synthesis evidence
  comparison. Browser tests use isolated servers and browser storage.
- Seven focused Model/synthesis/circuit browser cases and the four relevant
  existing workbench cases pass, including the recovery follow-up after fixing
  disclosure behavior. Separate output directories retain concurrent test records.
- All 342 frontend unit tests pass, including stale-run/phase feedback and the
  distinction between successful Python execution and failed collection.
- Nine synthesis-capture subprocess tests pass, including original QLBM and real
  observed synthesis progress. Follow-up tests check bounded phase-file reading,
  ordinary Python, cancellation and collecting-before-terminal behavior.
- TypeScript, Web build, changed-file Prettier and staged CLI package verification
  pass. No SDK source/example files, user drafts or research artifacts are edited.

The stage side channel is restricted to known phase values. Its supervisor reader
uses no-follow, non-blocking descriptors, requires a regular file and reads at
most 257 bytes. Capture/collection errors remain separate from script exit status.
The native Harness remains authoritative for Agent tasks; this change reports
only local Python-task SDK phases. No paid model calls are made.
