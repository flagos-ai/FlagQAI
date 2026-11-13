# Saved research metric comparison acceptance

Date: 2026-11-13

This Web change depends on the saved research evidence backend in
`feat/research-result-evidence`. It adds a compact research outcome section to
the existing experiment comparison view; existing distribution comparisons,
circuit previews and controls remain available.

## Behavior

- Display metrics only when the saved report matches the experiment archive,
  program hash, source hash and originating run.
- Compare matching research problems, methods, units and metric directions.
  Incomplete or failed executions retain evidence without an improvement claim.
- Show absolute and relative objective differences, probability changes in
  percentage points, and circuit resource costs.
- Label sampled changes as observations without tested statistical significance.
  Whole Python run timing is never treated as isolated candidate timing.
- Keep execution parameters, gate rotations and source/archive/report identities
  in a disclosure below the outcomes.

## Local verification

- `npm run typecheck` and `npm run build`: passed.
- `npm test`: 240 tests passed, zero failures or skips, including binding mismatch,
  incompatible metrics, failed executions and separate resource cost handling.
- `npm run format:check`: passed.
- `FQ_LOCAL_PYTHON=<local SDK Python> npm run test:e2e -- research-metrics.spec.mjs`:
  one browser test passed using real local FlagQuantum/PyTorch computation.

The browser fixture starts independent Web/Agent services and a temporary
workspace. A single trusted two-qubit weighted Max-Cut QAOA script saves baseline
and variant FQX results at different rotation angles, with exact probabilities
and 128 sampled shots. The test compares values read from their saved reports,
opens version evidence, refreshes, swaps comparison sides and checks an 820px
viewport for document overflow. It verifies that comparison and refresh add no
Python runs and preserve both an unsaved editor draft and an unsent chat draft.
Wide and narrow screenshots were inspected locally.

No paid model was called. The user's running services and research workspace
were not used for this isolated acceptance.

## Limits

The backend currently supplies metrics for supported bounded literal Max-Cut
graphs. This acceptance checks one small genuine QAOA example; it does not
establish quantum advantage, sampling significance, large-instance performance
or live model reliability. Other saved experiments retain the existing
comparison experience without fabricated research metrics.
