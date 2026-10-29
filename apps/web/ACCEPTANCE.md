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
- Quantum workspace backend suite: 74 passed with the configured SDK; the
  standard-library-only run passes with 16 SDK-dependent tests skipped.
- Staged CLI package boundary verification and clean installed-runtime acceptance passed.
- Unified launcher verified with both an existing Agent and an owned Agent on
  isolated ports; shutdown preserves the existing 4096/4188 services.
- Read-only SSH doctor reports FlagQuantum 0.4.0 and save/load ready.
- No CLI runtime behavior was changed by these Web fixes.

Local, ignored evidence is retained under `.flagqai/verification/`, including
`acceptance-live.py`, `acceptance-live.json`, `acceptance-protected-draft.png`,
`acceptance-offline.png`, and `acceptance-real-result.png`.
