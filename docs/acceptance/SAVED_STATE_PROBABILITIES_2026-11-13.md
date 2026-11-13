# Saved statevector probability acceptance — 2026-11-13

## Behavior

Jobs displays probabilities derived from the complete saved pure state, even when
its diagnostic amplitude preview contains only the first 1024 elements. It does
not execute the archived program or synthesize counts. The existing recorded-state
view, provenance, archive download and export behavior remain available.

The projection reports the original probability sum, support above 1e-14, up to
256 states ordered by descending probability (basis index breaks ties), and the
probability outside that preview. The table pages 32 entries at a time. Values
are never renormalized. Basis strings use q0 first. Batched, malformed, nonfinite
or unavailable states do not become invented probability distributions.

Selected legacy records can acquire a probability projection from the original
archive after its SHA-256 matches the imported record. A missing, changed or
unreadable archive leaves the recorded values intact. Successful upgrades persist
in both the program and job metadata; reopening does not project again. Library
listing does not eagerly load all archives. No import limits are raised here.

## Validation

Environment: macOS, Python 3.12.14, FlagQuantum 0.4.0, PyTorch 2.13.0.

- SDK acceptance: 134 tests, zero skips, failures or errors. Includes a real
  16-qubit state with nonzero amplitudes outside the diagnostic preview, legacy
  record upgrade and reopen, unchanged archive bytes, changed/missing archive
  preservation, deterministic bounded support, invalid state shapes and finite
  amplitudes whose probability sum overflows. Projection is also exercised with
  execution and sampling patched to fail.
- Web: 250 unit tests passed; typecheck, build and formatting passed.
- Browser: two real SDK scenarios passed. The new scenario checks a 16-qubit
  sparse result (two states at 50%), 512-state pagination capped at 256 entries,
  omitted probability, non-unit probability sum without renormalization,
  switching from the last page to another result, reading a legacy list entry
  through the real archive endpoint, refresh, unchanged archive digest, unchanged
  Python-run IDs and preservation of an unsaved editor draft. Legacy list data
  is deliberately simulated from real saved records; durable legacy migration is
  tested separately against the real SQLite store and archive. The existing
  Python error/output/export scenario also passes with the new probability view.
- CLI staged package: 2666 files, 32 entry targets; unchanged CLI source.

Commands (using an SDK-enabled Python as `python` and `FQ_LOCAL_PYTHON`):

```sh
python packages/quantum-workspace/tests/sdk_acceptance.py --report /tmp/saved-state-sdk.json
npm --prefix apps/web test
npm --prefix apps/web run typecheck
npm --prefix apps/web run format:check
npm --prefix apps/web run build
npm --prefix apps/web run test:e2e -- saved-state.spec.mjs workbench.spec.mjs --grep 'complete saved state probabilities|missing output and real Python errors'
node apps/cli/scripts/verify-staged-package.mjs
```

No paid models were called. The acceptance fixture used separate temporary
workspace data and ports; existing services, chats, drafts and research artifacts
were not modified.
