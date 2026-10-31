# Workbench acceptance — 2026-10-29

This acceptance checks the current optional Web workbench. It is not a claim
of production readiness or an evaluation of model reasoning quality.

## Environment and boundaries

- Real compute: isolated loopback host on port 4193, existing SSH CPU runtime,
  Python 3.11.13, FlagQuantum 0.4.0, 1024 shots, seed 42.
- Agent protocol: explicitly labelled scripted test service on ports 4192/4098,
  using the actual native command adapter, transcript projector and file sync.
- The main host on port 4188 was kept running. Its database and browser drafts
  were not replaced by test fixtures. Fixtures use separate databases.
- No paid model calls, quantum hardware calls, credentials, or public deployment.
  Natural-language generation by the production Agent remains untested here.

## Verified behavior

| Scenario | Observed outcome |
| --- | --- |
| GHZ Python execution and automatic `.fqx` collection | `000: 518`, `111: 506`; three logical gates; saved file opens in Quantum and Jobs. |
| Add `circuit.x(2)` and rerun | `001: 518`, `110: 506`; four logical gates; same filename produces a distinct artifact and run identity. |
| Edit code without rerunning | Previous output is identified as an earlier snapshot; Quantum and Jobs show `Differs from editor`. |
| Artifact binding | Run ID, immutable Python source, source SHA-256 and file SHA-256 checked against the artifact record. |
| Concurrent Agent file update and user edits | User draft remains intact; review shows both versions; Keep my draft preserves it. |
| Agent tool transcript | Tool calls stream and complete; eight calls fold into `Worked for`; transcript returns after refresh. |
| Python syntax error | Real `SyntaxError`, exit 1, failed status and Go to line 1; no fabricated successful result. |
| Python runtime error | Real `RuntimeError`, exit 1, failed status; no new artifact. |
| Cancellation | A running SSH Python task is cancelled; no artifact is fabricated. |
| Service disconnected before submit | Separate connection alert; draft retained; status is explicitly unknown rather than falsely reported as executed. |
| Reconnect and retry | History checked for duplicates; no unfinished/duplicate submission; same draft reruns successfully. |
| Browser refresh | Draft, run history, selected saved result and manually selected older Quantum circuit survive refresh. |

## Repairs from this acceptance

1. Restore saved experiments as one reducer transaction. An earlier selected
   archive must not be replaced while newer records or Python polling arrive
   first. A selected older archive remains available within the recent-list cap.
2. Display connection errors separately from Python stdout/stderr and explain
   uncertain submission status. Do not automatically retry mutation requests.
3. Make the stale-output message actionable: run Python again to update it.

Regression coverage includes archive hydration order, run-poll races, old
selection retention beyond eight records, and uncertain network submission
without automatic duplicate retries.

## Checks

- Web type checking and production build passed.
- Web test suite: 107 passed.
- Quantum workspace backend suite: 76 passed with the configured SDK; the
  standard-library-only run passes with 17 SDK-dependent tests skipped.
- Staged CLI package boundary verification and clean installed-runtime acceptance passed.
- Unified launcher verified with both an existing Agent and an owned Agent on
  isolated ports; shutdown preserves the existing 4096/4188 services.
- Read-only SSH doctor reports FlagQuantum 0.4.0 and save/load ready.
- No CLI runtime behavior was changed by these Web fixes.

Local, ignored evidence is retained under `.flagqai/verification/`, including
`acceptance-live.py`, `acceptance-live.json`, `acceptance-protected-draft.png`,
`acceptance-offline.png`, and `acceptance-real-result.png`.

## CI portability follow-up

The internal native-tool entry is `packages/quantum-workspace/workbench.py`.
It deliberately avoids `platform.py`: Python 3.11 on Linux imports the standard
library `platform` module while initializing `uuid`. A same-named entry file in
that directory shadows it. Regression coverage imports both standard modules
from the adapter directory and exercises the actual HTTP command round trip.

## Python Agent-to-Quantum follow-up

An isolated browser acceptance on ports 4194/4099 used the actual native command
adapter, HTTP service, transcript projector and FlagQuantum 0.4.0 CPU execution
(Python 3.12.14). Only Agent generation was scripted; no model was called. The
user's 4188 workbench, drafts and production Agent service were kept running.

- First turn wrote GHZ Python, saved `acceptance.fqx`, then opened Quantum with
  three gates and `000: 518`, `111: 506` in its saved result.
- Second turn added X on qubit 2, saved the same filename, and opened a distinct
  four-gate artifact with `001: 518`, `110: 506`.
- Both runs' source text/SHA-256, artifact origin/run ID and downloaded original
  file SHA-256 matched. The older circuit and result remained independently readable.
- A draft typed between sharing and the Agent file update survived computation,
  automatic navigation and refresh. Review showed the draft and incoming Python;
  **Keep my draft** retained the exact text. Quantum reported **Differs from editor**.
- Two completed tool sequences folded into **Worked for** and returned after refresh.
- Fixed Follow Agent resetting to Off on refresh. The preference now survives
  refresh while initial historical action pages cannot replay old navigation.
  Manually selecting the older three-gate circuit and refreshing retained it,
  even with Follow Agent On and the later four-gate action in history.
- A third task after refresh still followed new Python execution and opened its
  new four-gate artifact, confirming that historical replay suppression does not
  disable live navigation.

The new SDK regression drives the real command/HTTP/Python/save/load chain twice,
rejects stale revisions, checks request-ID retry deduplication, and verifies exact
execution identity plus retained earlier results. Local ignored evidence:
`.flagqai/verification/closed-loop-acceptance.json` and
`.flagqai/verification/closed-loop-draft-review.png`.

## Active Agent recovery — 2026-10-30

Isolated scripted native protocol services and a loopback fault proxy verified
refresh and network loss without making any model or quantum compute call.
The normal 4096/4188 services were not restarted or reconfigured.

| Scenario | Observed outcome |
| --- | --- |
| Refresh during a running task | Same native session, original question, Todo/subagent status and tool output restored; one backend submission. |
| Disconnect events, then refresh while offline | Restoring state and automatic backoff; bringing the proxy online restored the original running tool without clicking Connect or resending. |
| Backend accepted input but receipt/events were lost | In-flight ID and payload survived refresh. Native history confirmed the original user-message ID; submission count remained one. |
| Type a newer composer draft while offline | Recovery cleared uncertainty but retained the new draft verbatim. |
| Task completes while disconnected | Final answer and completed tool history restored; process folded into Worked for. |
| Rejection receipt lost, refresh, then explicit retry | Original payload/ID returned the original rejection. Backend submissions stayed at two, not three; the rejected draft stayed in the composer. |

Repairs: startup retry for stored sessions; resource-404 rebinding without a new
conversation; fresh-snapshot gating after stream failure; per-tab in-flight
delivery persistence; native message-ID confirmation; explicit original-request
retry; and a restoration placeholder. Fixture trigger matching now excludes
hidden workspace metadata, whose `python.cancel` text previously held generic
scripted turns open unexpectedly.

Web regression suite: 112 tests passed, including exact native-session recovery,
transient/denied access, original payload restoration and strict native message-ID
correlation. Typecheck, production build, CLI staged package and clean installed
runtime checks passed. Ignored evidence is under `.flagqai/verification/`:
`agent-recovery-running.json`, `agent-recovery-lost-receipt.json`,
`agent-recovery-confirmed.json`, `agent-recovery-explicit-retry.json`,
`agent-recovery-completed-offline.json` and
`agent-recovery-completed.png`. These validate protocol recovery, not production
model reasoning or recovery of a terminated backend process.

## Python failure-to-repair acceptance — 2026-10-30

The isolated workbench on 4261 and scripted native service on 4161 used real
FlagQuantum 0.4.0 CPU execution (Python 3.12.14). No model was called, no package
was installed and normal 4096/4188 services were preserved.

| Failure | Observed diagnostic | Repair verification |
| --- | --- | --- |
| Syntax | `SyntaxError: '(' was never closed`, line 4 | Failed source/log attachment previewed; dedicated file repaired and actual Bell experiment saved. |
| Missing demo dependency | `ModuleNotFoundError`, line 2 | Unused demo import removed; real SDK rerun completed without installing anything. |
| SDK parameter | `flagquantum.errors.ValidationError` for qubit 99 outside `[0, 1]`, line 5 | Corrected circuit executed and saved with two gates and recorded measurements. |

- All three failed records, source hashes and stderr logs remained unchanged.
- All three scripted repairs completed with actual counts `00: 518`, `11: 506`
  and distinct experiment IDs. Accepting a repair and clicking **Run Python**
  created a fourth successful execution and another independent artifact.
- Each saved record's origin run ID, exact source/SHA-256, original `.fqx`
  download SHA-256 and two-gate compiled circuit were checked.
- A newer unsaved editor draft survived edits and automatic navigation; Quantum
  showed **Differs from editor**. Review displayed both versions; **Keep my draft**
  preserved it, and a later **Accept Agent changes** applied the corrected code
  before the manual rerun.
- An existing chat draft triggered the append/cancel dialog. Cancel kept both
  drafts and inserted no attachment; append retained the original chat text.
- Preparation staged data only; the test explicitly pressed **Send**.
- Python attachments now collapse under their question, rather than exposing
  their JSON envelope in the transcript.
- Fixed historical Python action replay replacing the manually selected failed
  run after refresh. With Follow Agent On and several later successful actions,
  the selected failure and its repair button remained available after hydration.

Web suite: 116 tests passed, including traceback classification, long failed
source retention, bounded log tails, stale file rejection and draft protection.
Typecheck, build, CLI staged-package and clean installed-runtime checks passed.
Ignored evidence under `.flagqai/verification/` includes
`python-repair-failures.json`, `python-repair-acceptance.json` and
`python-repair-review.png` and `python-repair-entry.png`.

This verifies UI, native protocol and actual SDK execution. Scripted repairs are
restricted to the three marked examples; production model repair quality and
installation of genuinely required missing dependencies were not evaluated.

### 2026-10-31: retained archive recovery and independent imports

- Web: 118 tests, TypeScript check, production build and changed-source formatting passed.
  The repository-wide formatter still reports two unchanged baseline files:
  `src/workspace.css` and `src/data/gate-example-results.json`.
  Backend: 81 tests plus the new real-SDK recovery acceptance passed. Staged CLI
  package verification (2646 files / 32 entry targets) and clean installed-runtime
  acceptance passed. No model calls or package publishing were performed.
- Real FlagQuantum 0.4.0 on Python 3.12 / CPU: simulated an unavailable preview
  parser while a real script saved `first/bell.fqx`, `second/bell.fqx` and an invalid
  archive. Initial execution completed (exit 0); collection failed. Restoring the
  parser and choosing **Retry collection** recovered both valid files, retaining
  the invalid file's error and download. Counts were `00: 70, 11: 58` (128 shots).
- The two valid files share their exact bytes/hash but receive distinct artifact
  identities and retain their original task paths. Recovery leaves the original
  run's ID, source/hash, logs, exit code and finish time unchanged. Reopening the
  service before retry is covered by the real-SDK test. Repeated retries do not
  duplicate healthy artifacts. Unit coverage includes checksum changes, missing
  files, parser errors, concurrent retry rejection and retained scan errors.
- Browser acceptance on isolated port 4261: recovery, per-file circuit/result
  navigation, matching file/run provenance, editor mismatch indicator, refresh
  with a selected historical run/result, and dirty Python draft preservation were
  verified. A manually imported recovered archive opened immediately as an
  **Independent file import**, without attributing it to the selected run.
- Reader failure and mismatched-provenance coverage verifies that a failed
  preview does not hide a healthy sibling and a retry only reads saved archives.
  Browser file-import acceptance used a genuine `.fqx`; it did not simulate a
  successful parser or compute result.
