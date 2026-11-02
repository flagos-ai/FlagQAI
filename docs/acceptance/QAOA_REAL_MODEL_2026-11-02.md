# QAOA real-model acceptance — 2026-11-02

## Outcome

The real native Agent completed independent code authoring, actual SDK execution,
baseline/optimized comparison and archive replay without human code corrections.
It required two autonomous corrections and three compute attempts. This was not
the scripted protocol backend. Functional evidence and independent artifact checks
pass. Monetary billing is not independently verifiable from the current service.

- Provider/model: `baai / deepseek-v4.1-flash`; unchanged during the task.
- Native session: `297a61d3-6a41-4b04-b0ef-1d06acca9f98`.
- History title: `QAOA Max-Cut real-model acceptance 2026-11-02`.
- Native turn: 2026-11-02T13:50:16.407000+08:00 through 2026-11-02T13:55:05.683000+08:00; 289.276 seconds.
- Successful SDK run: `afe4f301-963a-45f1-9936-27ce8dd0f75b`; compute time 3.105 seconds.
- Source SHA-256: `9d613013fe3353479221080fa702112ff3a18558cce2bf1ef02a6eb0ace834b1`.
- Runtime: FlagQuantum 0.4.0, PyTorch 2.13.0+cpu, Python 3.11.13, SSH compute transport.
- All three recorded plans resolve backend fallback to false; archive provenance
  reports CPU with no CPU fallback used.

## Scientific checks

The graph is a six-node triangular prism with 9 edges. Independent enumeration
of all 64 bitstrings establishes optimum 7, attained by six states. The Agent
ran 81 exact-probability grid evaluations and sampled 4096 shots with seed 42.

| Metric | Uniform baseline | QAOA |
|---|---:|---:|
| Expected cut | 4.499998391 | 5.871087839 |
| Exact optimum probability | 0.093749966 | 0.411668926 |
| Sampled mean cut | 4.506347656 | 5.864746094 |
| Sampled optimum rate | 0.094726562 | 0.413330078 |

The generated cost unitary uses exp(-i gamma sum ZZ), with RZ(2 gamma),
and gamma=8*pi/9, beta=pi/9. Relative to the reference cut-cost convention,
gamma_cut=-2*gamma modulo 2*pi = 2*pi/9. The parameters therefore must not be
compared numerically without accounting for this convention. The objective and
measurement metrics were independently recomputed from the downloaded archives.
This small ideal simulation does not demonstrate quantum advantage or a global
continuous-parameter optimum. Float32 differences at ~1e-6 do not establish a
physically unique parameter optimum.

## Failures retained

1. Run `d5af1cb4-9dc0-4c28-a50d-5c00d5b1bcc9` stopped on the Agent's incorrect initial assertion
   that the classical optimum was 6; its own enumeration produced 7.
2. Run `af8ee12b-4b29-4252-adcd-2312a44ac11c` stopped on a 1e-9 probability-mass tolerance applied
   to float32 output with mass 0.999999642.
3. The Agent corrected both independently, retained the real failures, and passed
   all computation/archive checks in the final run. No evaluator supplied code,
   selected parameters or expected numerical results after submission.

## Saved evidence and reproduction

The three original files are bound to the successful run and exact executed
source. Their downloaded SHA-256 values were verified against platform records.
The optimized and replay archives have identical counts and probabilities.
An additional evaluator-owned CPU execution of the downloaded optimized archive
also reproduced its counts; probability difference was below 1e-6.

- [01-maxcut-baseline.fqx](http://127.0.0.1:4188/api/experiments/fqx-905e6aa70e274c98bf263b4c8336ca1e/file): `1e4d225dde0484d44fa2bd516c5bebf30cc8c4863555377c929261ed69f7ade9`.
- [02-maxcut-qaoa.fqx](http://127.0.0.1:4188/api/experiments/fqx-19d77a78135c4d8997b4daed99ee91f1/file): `8125f684825ec80f225c024393f8fc3e838c8ba3806c6eb7e06bb6f93a54bd45`.
- [03-maxcut-replay.fqx](http://127.0.0.1:4188/api/experiments/fqx-6fc6656b80f6431a990fadeff42ec771/file): `8125f684825ec80f225c024393f8fc3e838c8ba3806c6eb7e06bb6f93a54bd45`.

The independent check and generated source are retained locally:

- Agent-authored source (`agent-solution.py`, local acceptance output)
- Independent archive verifier (`verify_archives.py`, local acceptance output)
- Structured acceptance evidence (`acceptance-summary.json`, local acceptance output)
- Baseline vs QAOA screenshot (`baseline-vs-qaoa.png`, local acceptance output)
- QAOA vs replay screenshot (`qaoa-vs-replay.png`, local acceptance output)
- Optimized circuit screenshot (`optimized-circuit.png`, local acceptance output)

## Web integration findings

The Agent independently invoked circuit/result presentation and both comparison
actions. Follow Agent was intentionally off in the isolated acceptance tab.
Manual UI review verified the exact compared operands, zero replay distance,
restored selections after refresh, circuit visibility and the retained test draft.
The user's existing browser profile and draft storage were never attached or edited.

A real-session defect was found: injected native context messages advanced the
Web workspace turn anchor, while the visible human row retained its original
sequence. This hid experiment cards/history association. The Web reducer now
ignores injected messages as human anchors; action association also understands
sequence intervals for historical affected turns. The existing real session was
reverified without sending another model message. Regression cases cover injected
messages and historical ownership boundaries.

Finding at initial acceptance (resolved in the follow-up below): earlier failed attempts that the Agent has repaired still
leave the outcome card displaying `Run needs attention`. The final artifacts and
comparisons are valid and usable, but the summary should distinguish recovered
history from a currently failed task. This report does not mark the whole product
ready for release.

## Budget and accounting

The user explicitly authorized this real-model task with a CNY 10 ceiling. The
previously user-confirmed gateway hard cap was used as the external protection;
no provider/model switch, parallel subagent or additional acceptance prompt was
used. No gateway quota rejection occurred. The local service exposes neither a
readable gateway hard-limit state nor an actual CNY invoice, so this report does
not independently certify or invent the final monetary amount.

Native cumulative usage for this turn: input 1,760,420,
output 47,399, cache-read 1,636,608,
cache-write 0. These are raw reported counters;
no assumed gateway price or exchange rate was applied. Independent artifact/UI
verification after the turn made no additional model calls.


## Automated regression after the integration fix

Web type checking and all 197 unit tests passed. All 28 browser journeys passed,
including injected native context, source safety, archive replay, comparison,
reload and manually resized panels. Product journey acceptance passed using the
existing pinned-SDK evidence. The pinned SDK suite was not rerun for this
presentation-state fix; independent actual archive execution is documented above.

The raw native event trace is retained as a hash-verified compressed JSONL file
in the local acceptance directory. Its SHA-256 and sizes are recorded in
`trace-integrity.json`; no provider credentials were collected or published.


## Follow-up: recovered task status fixed without model calls

The completed real session was reviewed again after the presentation fix, with
message submission explicitly blocked in the review browser. It now shows
Experiment ready and Earlier run issues · 2. Both original failed runs remain
expandable and View run selects their exact output/history, while the protected
editor draft remains unchanged. Comparisons, zero replay distance, reload
restoration and circuit navigation passed again. No additional model request was
sent, and neither the Agent-authored code nor its archives were modified.

Recovery requires a completed native turn, complete run facts, a later successful
run with fully collected saved results, and no ongoing execution/collection.
Latest failures, missing metadata and current collection problems retain their
warning states. Earlier issues are displayed as history, not silently erased or
claimed to have been individually resolved.

The recovery fix passed the Web build, type checking, all 206 unit tests and all
28 browser journeys. The QAOA browser journey includes an intentional failed run,
a successful retry, historical-output inspection and refresh restoration. Product
journey acceptance passed using the existing pinned-SDK evidence; the 94-test SDK
suite was not rerun for this UI-state change.

- Recovered task card (`recovered-task-card.png`, local acceptance output)
- Post-fix UI verification (`post-recovery-fix-ui-verification.json`, local acceptance output)

## Follow-up: final outcome card, no new model calls

The original successful run's archives now drive the final QAOA outcome card.
Independent client-side calculations reproduced expected cuts
4.499998390674591 → 5.871087839244865 and sampled optimal-cut rates
0.0947265625 → 0.413330078125. Recorded source SHA-256 matched all three archive
origins and their run-manifest identities. Seeded replay matched exact counts and
probabilities (maximum probability difference 0), with identical program,
compiler, environment and options fingerprints.

Browser review reused the existing session in an isolated context with model
message submission blocked. Read-only saved code, exact circuit selection,
replay comparison, refresh restoration and both historical failures passed;
the sentinel editor draft remained unchanged. There were no model submissions.

- Outcome card (`qaoa-outcome-card.png`, local acceptance output)
- Expanded evidence (`qaoa-outcome-evidence.png`, local acceptance output)
- Derived metrics verification (`outcome-derived-verification.json`, local acceptance output)
- Outcome UI verification (`outcome-ui-verification.json`, local acceptance output)

Outcome-card validation passed the Web build and type checks, all 211 unit tests
and all 28 browser journeys. The scripted QAOA journey additionally checks the
new saved-code dialog, draft-safe circuit navigation and restored outcome state.
The original real-session review verifies exact baseline/optimized comparison
IDs and a zero-distance optimized/replay comparison. Product journey acceptance
passed with the existing pinned-SDK evidence; no new SDK suite or paid-model run
was needed for this presentation feature.

## Follow-up: draft-safe iteration preparation, no new real-model turn

The existing real QAOA session was reused to verify parameter preparation against
its actual saved optimized archive. Requested p=2, shots=4096 and seed=42 were
appended after an existing chat draft, with the parent run/source/archive hashes
pinned. Refresh restored the combined chat draft. A 5,999-character draft caused
an explicit capacity refusal without replacing text. The protected editor draft
remained unchanged. Model message submission was blocked in the isolated review
browser; no native model task was submitted.

- Iteration settings (`qaoa-iteration-settings.png`, local acceptance output)
- Preparation verification (`iteration-prepare-verification.json`, local acceptance output)

Separate scripted native-protocol browser acceptance executed the real local SDK
for a p=2 shared-angle iteration and verified baseline retention through an
intentional failed process, later recovery, distinct source/run/artifact IDs,
increased compiled depth, comparison against the previous optimized archive and
restoration after refresh. This demonstrates the local integration, not autonomous
p=2 performance by a new real-model turn. No paid model call was made.

Iteration validation passed the final Web build/type check, all 216 unit tests,
and all 28 browser journeys. Product journey acceptance passed using existing
pinned-SDK suite evidence. No additional standalone 94-test SDK suite or real
model turn was run. The final live-page review also checked the compact parameter
form after its layout adjustment, with message submission blocked.

## Follow-up: research record without a new model turn

The outcome card now opens an evidence-based research record. Original native
request context, all three real-model attempts (including the two failures), saved
source hashes, archive references and derived QAOA metrics were recovered from
existing records. The root expected-cut value remained 5.871087839244865. Model
monetary cost remains explicitly unrecorded.

In an isolated review browser with model-message submission blocked, a temporary
adoption note was saved, restored after refresh and cleared. It did not change
the user's actual browser preference or source draft. The JSON export retained
source snapshots and both failures; selecting a failed attempt opened its exact
original logs while preserving the sentinel draft. No new model request or
production Python execution was submitted.

- Research overview (`research-record.png`, local acceptance output)
- Research UI verification (`research-ui-verification.json`, local acceptance output)
- Verification-only export (`research-record-verification-export.json`, local acceptance output)

The scripted local QAOA browser journey separately verifies cross-version
membership, original goal recovery, explicit adoption, download contents, refresh
restoration, failed-run inspection and baseline-versus-iteration comparison.
Unrelated runs are excluded; corrupt or unverifiable evidence cannot become a
passing adoption. Original .fqx archives remain separate downloads.

Research-record validation passed build/type checking, all 228 unit tests and all
30 browser journeys. The final product journey acceptance passed with the existing
pinned-SDK suite evidence; no additional standalone 94-test SDK suite or real-model
turn was run. An initial full browser run had two result-collection wait timeouts
near a transient local disk-write failure. Both cases passed separately in a fresh
workspace, followed by a complete fresh 30-test pass. No assertion was removed or
timeout increased. Existing user sources and historical artifacts were not deleted.

## Follow-up: portable research package and explicit reproduction

The updated local service exported the existing real-model record as a 45,406-byte
ZIP with three run snapshots (including both failed attempts), exact sources and
three original `.fqx` archives. Integrity verification passed. The export used no
adoption choice and did not change the user's stored choice, drafts or history.
It was not imported into the production catalog and caused no new model or Python
execution there.

- Existing-record research ZIP (`qaoa-research.zip`, local acceptance output)
- Export verification (`research-package-export-verification.json`, local acceptance output)

The scripted QAOA journey separately restored its baseline and p=2 iteration in
a clean browser with native run-detail reads blocked. It verified corrupt-package
rejection, repeated imports with independent IDs, original logs, current adoption,
refresh restoration and unchanged drafts. Imported records created no Python run.
Opening the adopted p=2 source retained the existing draft; only explicit Run
Python created a new local SDK run with the adopted source hash and matching
seeded counts. This tests the integration and does not claim another autonomous
real-model iteration.

Final validation passed all 30 browser journeys, five focused package test cases
and all 99 backend tests with the actual local SDK available. Product journey
verification passed using existing pinned-SDK suite evidence; no additional
standalone 94-test SDK suite was run. The original real-session research UI and
draft were rechecked after the local service refresh with model submission
blocked. No paid model call was made.

## Follow-up: environment check, explicit reproduction and automatic verdict

The existing real-model research ZIP was restored into an independent temporary
workspace with the local SDK, without touching the production editor or Agent
session. The fixed runtime probe created no Python run. Explicit start created
one run using source SHA-256
`9d613013fe3353479221080fa702112ff3a18558cce2bf1ef02a6eb0ace834b1`.
Repeating the same receipt did not submit another task. The persisted verification
record was readable after recreating the verification service.

The local runtime was FlagQuantum 0.4.0 / Python 3.12.14 / PyTorch 2.13.0 on CPU.
The archived Python version difference was disclosed. All three saved circuits
and seeded counts matched exactly. Optimized expected cut was
`5.871087839244865` originally and `5.871087804262061` locally; probability values
were within the declared absolute `1e-7` / relative `1e-6` numeric tolerance.
Sampled optimal-cut rate remained `0.413330078125`. The resulting verdict was
**within tolerance**, not exact equality. The original evidence and failure
attempts were retained.

- Independent local verification report (`verification.json`, local acceptance output)

The scripted native-protocol browser journey separately verified preparation
without execution, one explicit independent run, preserved editor draft, three
artifact comparisons, idempotent start, report download and restoration after
refresh. Its local SDK p=2 replay matched exactly. These are local integration
checks, not a new real-model reasoning or optimization turn. No paid model call
was made, and no production reproduction was submitted by verification scripts.

Final validation passed all 30 browser journeys, 228 frontend tests and 106
backend tests with the actual local SDK. Product journey verification used the
existing pinned-SDK evidence; no additional standalone 94-test SDK suite was run.
Missing or changed archive bytes are retained as incomplete verification with the
new run receipt, rather than an endless in-progress state or a successful verdict.

## Follow-up: fresh virtual environment and preparation guidance

A new isolated temporary virtual environment was created
without system site-packages. The pre-install probe confirmed FlagQuantum was
absent. PyTorch 2.13.0 and build dependencies were installed from cached packages.
An exact Git archive of SDK commit
`4ed3b8252200900d25350aaac6ddc9abbf8bc1e6` was built into a native macOS ARM64
wheel and installed non-editably. Wheel SHA-256:
`281217c27dd54ccdf6c84792bda40eb2192d308441cdaa03555957baf8e7d9c0`.
SDK module/distribution versions both reported 0.4.0 and `pip check` passed.

Acceptance ran using `-I`, no PYTHONPATH/PYTHONHOME or user site, and copied
standalone service code plus the existing QAOA ZIP. The SDK imported from the new
venv's site-packages. No SDK checkout was on the import path. A separate empty
interpreter produced a blocked preparation receipt; starting it created no run.
The installed interpreter imported and checked without execution, then explicitly
created exactly one independent reproduction run. The verdict was within numeric
tolerance, all three archived seeded counts matched, two historical failed
attempts remained, and the original evidence and draft sentinel were unchanged.
The report remained readable after recreating the verification service.

The first acceptance attempt stopped during preparation because uv's local-wheel
receipt lacked an archive hash. No archived source ran in that attempt. Installing
the same wheel with pip provided a hash-bearing installation receipt; the failed
attempt/log was retained and the completed acceptance used a separate fresh data
workspace. The probe does not invent wheel hashes when a receipt omits them.
The clean environment also logged PyTorch's optional NumPy warning; NumPy was not
installed or required by this QAOA task, and dependency consistency checking passed.

- Fresh environment acceptance (`acceptance.json`, local acceptance output)
- Scientific verification (`verification.json`, local acceptance output)
- SDK build evidence (`sdk-build.json`, local acceptance output)

Old archives lacked a complete original dependency inventory/revision. Guidance
therefore labels unknown pins and current candidate versions rather than claiming
an exact historical environment. Production runtime settings, drafts and Agent
history were not changed by this isolated acceptance. No paid model calls were made.

Final regression passed 30 browser journeys, 228 frontend tests and 110 required
backend SDK tests with no skips. Both browser compute/archive reading and required
SDK acceptance used the new installed environment without a development
PYTHONPATH. Product journey acceptance used the fresh 110-test SDK report, rather
than the earlier 94-test evidence. The local service was refreshed only after
checking that Python and Agent work were idle; original databases and SSH compute
configuration were retained. Manual preparation commands do not install packages
or alter the production interpreter.

## Follow-up: portable verification history and complete delivery

The existing clean-environment QAOA record was exported with its blocked empty-SDK
preparation check and successful tolerance verification. The v2 ZIP includes those
two report snapshots, the successful reproduction's exact code, original run/log
snapshot and its three saved archives, alongside the original three research
attempts (including two failures).

A fresh independent data workspace imported it without submitting a run. Both
verification snapshots were labeled archived and absent from the local receipt
store. Their original package context and report IDs were preserved without
claiming that the destination environment had passed. Explicit local preparation
and reproduction created one new run, passed within tolerance and did not alter
the original evidence or independent draft sentinel. Repeating start did not
create another run. A second export/import retained all three distinct report
snapshots, with zero current receipts/runs in the second independent workspace.
All original source identity remained
`9d613013fe3353479221080fa702112ff3a18558cce2bf1ef02a6eb0ace834b1`.

- Delivery acceptance (`acceptance.json`, local acceptance output)
- Original delivery with verification history (`qaoa-delivery.zip`, local acceptance output)
- Reverified delivery (`qaoa-delivery-reverified.zip`, local acceptance output)

The existing browser QAOA journey also uses the original export/import buttons
and report/log controls to check archived-only import, no current pass, bundled
logs without native-run reads, explicit independent reproduction, source-bound
summary counts and unchanged editor draft. Backend tests reject source/artifact
mismatches, active/unsupported reports, missing conclusive evidence and false
positive verdicts before committing any imported record. Failed reproduction
reasons/logs and legacy v1 imports remain covered. No paid model call was made.

Final regression passed all 30 browser journeys, 230 frontend tests and 114
required backend SDK tests with no skips. Product journey acceptance used the
fresh 114-test installed-SDK report. The standalone existing-QAOA delivery
acceptance also passed with final per-artifact verdict/metric checks enabled.
The idle local 4188 service was refreshed to load v2 support; production data,
compute settings and browser drafts were retained. No production research import
or reproduction was submitted by the validation scripts.


Local acceptance outputs named above are execution records, not committed fixtures.
To regenerate portable evidence without model calls, run the Web browser suite
(`pnpm --dir apps/web test:e2e --trace off`) with an installed SDK, or use
`packages/quantum-workspace/tests/clean_reproduction_acceptance.py --help` and
`packages/quantum-workspace/tests/research_delivery_acceptance.py --help` with a
trusted exported research package. Keep generated archives and runtime logs out
of the source repository.
