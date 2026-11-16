# Official synthesis catalog snapshot

The catalog is pinned to FlagQuantum commit `b3fa4a78935777bb8e3853752192e9cd47972b2f`.
It indexes 216 official native programs and separates documentation entries
from the ten editable Python copies. The copies retain the upstream definitions
and replace the entry point with an explicit run, probability/resource report,
and FQX save. The included Apache and Classiq MIT notices match the pinned tree.

The single portable report at `apps/web/public/examples/synthesis/acceptance.json`
binds recorded verification to the exact source hashes and SDK fingerprint. It
does not certify the reader's current compute environment. No raw execution
logs, archive bytes, or machine-specific interpreter paths ship in the catalog.

On 2026-11-16, an isolated CPU environment ran all ten copies and their independent
upstream Circuit comparisons, then replayed each saved circuit and compared its
statevector. All 30 checks passed. Fixed parameters, small instances, or signal
preparations do not establish optimization quality or a full research workflow.

To reproduce with a verified copy of the pinned SDK tree:

```sh
python apps/web/scripts/synthesis-catalog/generate.py /path/to/pinned-sdk
PYTHONPATH=/path/to/pinned-sdk python apps/web/scripts/synthesis-catalog/verify.py /path/to/evidence
```

Review the fresh report before updating the portable snapshot, and remove the
local `sdkRoot` path. Results from a different source hash do not count. The
verification tool uses an independent output directory; it does not modify
existing runs or make model calls.
