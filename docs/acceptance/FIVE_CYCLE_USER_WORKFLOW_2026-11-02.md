# Five-cycle workflow audit — 2026-11-02

## Scope and limits

This is an engineering walkthrough of the user-facing workflow, not a claim of
independent user research or autonomous model quality. The question, native tool
stream and file proposal are deterministic acceptance inputs. All quantum
optimization, execution, archive loading, comparison and reproduction use the
installed FlagQuantum 0.4.0 / PyTorch 2.13.0 SDK in the isolated local venv. No paid
model is called. Existing production drafts, native sessions and compute settings
are not used as the test workspace.

The new task uses the five-node cycle `(0,1),(1,2),(2,3),(3,4),(4,0)`, rather than
the six-node reference graph. The source enumerates all 32 classical cuts and
checks optimum 4. Initial p=1 bounded grid search uses 4096 shots/seed 42. A reviewed
iteration changes to 1024 shots/seed 43 and a 7-by-7 grid, preserving an exact
source/archive lineage reference to the initial result. It does not claim a global
QAOA optimum, quantum advantage or improvement merely because parameters changed.

## Issues found and fixed

1. **Task-blocking handoff:** editor runs accepted through Review changes had no
   direct research-record action in Python output. The Agent conversation exposed
   that action only for its own native run references. Python output now offers
   the existing research record for a completed QAOA archive set when the native
   task card does not already represent that run. The action sits in the existing
   completion summary, or existing toolbar in compact mode. It uses frozen run
   data, never current editor text. Native question/turn association uses the same
   shared mapper as the transcript, and reviewed iterations join research only
   through explicit validated lineage. No new Agent loop or page was introduced.
2. **Misleading availability:** a failed verification-history read kept an earlier
   positive count displayed as current. The delivery summary now labels current
   history unavailable. Retained cards identify their last confirmed snapshot and
   use a muted status; screen-reader status text also states that current state is
   unconfirmed. Source, logs and receipts remain retained. Poll recovery restores
   confirmed state without submitting a new task.

## Walkthrough evidence

The browser acceptance sends the natural-language five-cycle question, receives
scripted native tool events and executes the real SDK. It preserves a separate
initial draft and a failed process. The user explicitly opens the Agent model,
creates another unsaved note, reviews a deterministic incoming file edit and runs
only the explicitly accepted merged code. The new run's source equals that exact
merge, its circuit has five qubits and its sampled counts total 1024.

Undo restores the local draft while retaining the accepted version and executed
result. The output research action recovers the original five-cycle question
through native history and lineage. Version comparison resolves the actual parent
and reviewed optimized archives; adoption records a human reason rather than
selecting a score automatically.

Verification-history requests are interrupted during reproduction, then the page
is refreshed. The draft persists, the recovered receipt/run ID is unchanged and
no task is resubmitted. A second outage after success explicitly removes the
current passing count until polling succeeds again. The archive is exported using
the existing control, imported in a separate browser context with another draft,
and labeled archived rather than current verification. An explicit independent
local reproduction passes exactly without changing that draft. The original
failed run remains readable.

The fixture protocol tests interaction and source/result integrity. It does not
validate a real model's planning, coding quality, tool selection or new-graph
reasoning. Those remain a separately authorized real-model acceptance. Local
browser acceptance also does not certify remote compute behavior or production
readiness.

## Results and retained evidence

The task's uniform expected cut was `2.499999552965164`, initial 9-by-9 optimized
cut `3.712306645233184`, and reviewed 7-by-7 optimized cut
`3.688105017878115`. The reviewed version used 1024 shots and seed 43. The coarser
search regressed slightly; neither acceptance nor the UI treats changed parameters
as an improvement. Adoption remains an explicit reviewed decision with a note.

Full regression passed 31 browser journeys and 231 frontend tests. Product journey
verification retained the existing 114-test installed-SDK evidence; this
frontend-only audit did not rerun that standalone backend suite. The final focused
case additionally captured the task metrics and research ZIP using a separate
reporter/output folder without replacing the full-suite JSON evidence. No paid
model was called.

- Task audit JSON (`five-cycle-user-audit.json`, local acceptance output)
- Reviewed five-cycle delivery (`five-cycle-reviewed-delivery.zip`, local acceptance output)
- Offline verification state (`five-cycle-verification-offline.png`, local acceptance output)
- Independent verification (`five-cycle-independent-verification.png`, local acceptance output)

The local Web build was updated. Production SDK/SSH configuration and native
Harness ownership are unchanged. The user can reach the existing research record
from a completed reviewed QAOA run's Python output, in expanded or compact mode,
while their current editor text remains independent of the saved result.


Local acceptance outputs named above are execution records, not committed fixtures.
To regenerate portable evidence without model calls, run the Web browser suite
(`pnpm --dir apps/web test:e2e --trace off`) with an installed SDK, or use
`packages/quantum-workspace/tests/clean_reproduction_acceptance.py --help` and
`packages/quantum-workspace/tests/research_delivery_acceptance.py --help` with a
trusted exported research package. Keep generated archives and runtime logs out
of the source repository.
