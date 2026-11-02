# Explicit research reproduction

Verify reproduction lives inside a selected, verified QAOA research version. It
works with both native run evidence and imported research packages. The flow is
independent of the editor and chat state: neither source nor drafts are dispatched
to the editor, and no Agent message or provider request is made.

## Environment preparation

Check reproduction environment first validates the completed original run,
source hash and original archive bytes. A fixed probe runs on the configured
Python transport using the same local interpreter or SSH target as PythonRuns.
It imports FlagQuantum and PyTorch and reads Python/SDK versions, save/load
availability and CUDA availability. It does not execute the archived source,
simulate a circuit or create a Python run.

The prepared receipt records runtime facts, transport, required producer versions
and archived backend/device/precision/shots/seed settings. SDK/Python version
differences and missing CUDA are disclosed. Other backend dependencies are marked
unchecked. Version agreement is not a compatibility guarantee; external project
dependencies are not bundled. Preparation expires after ten minutes and changes
to the configured transport/interpreter or pinned evidence require a new check.

## Explicit execution and durable identity

Run archived source & verify submits the exact saved UTF-8 source to the existing
PythonRuns service. It runs in that service's temporary working directory with
the existing time, log, artifact and cancellation limits. The code is not rewritten
to force a backend or sampling policy. The user can cancel using the same run
service, or inspect its original output. The browser never starts another task
while polling for completion.

Receipts persist in a separate `.reproductions.sqlite3` database. A receipt binds
package ID (when imported), original run ID, source SHA-256, original artifact
IDs/hashes, environment facts and new local run ID. Repeating start for the same
receipt returns its state rather than submitting twice. An uncertain submission
is retained and is never retried automatically. Report polling resumes after
navigation/refresh without rerunning code. Native Python run restart/failure
handling remains authoritative.

## Automatic result checks

Verification waits for terminal execution and artifact collection. Execution,
cancellation and collection failures remain failures with their run history.
Missing/extra/ambiguous filenames, changed provenance, incomplete tensors and
non-finite values cannot pass. Reproduced artifacts must belong to the new run and
the exact pinned source hash. Original archive bytes are rechecked.

Artifacts are paired by their recorded filename, not randomized local IDs or ZIP
byte equality. The comparison checks compiled gate/wire/parameter/measurement
structure and full saved circuit IR when present, including matrices and
observables that diagram previews may omit. Measurements include shape, qubit
order, values, counts, shots and metadata. Derived presentation statistics are
excluded. Truncated previews cannot stand in for complete numeric evidence.

Verdicts distinguish exact equality, numeric agreement within absolute `1e-7` /
relative `1e-6`, different results, incomplete verification and failed execution.
Count values, shots and seed metadata must agree exactly even for a tolerance
verdict. Different random samples are reported as different, not statistically
equivalent. No timing, ZIP timestamps or generated IDs are treated as scientific
result differences. A literal Max-Cut graph also yields original/new expected cut
and sampled optimal-cut rate without evaluating the source as Python.

The persisted/downloadable JSON report includes per-artifact verdicts, original
and new archive references, tolerances, metrics, runtime and the source/run
identities. It does not replace the original adoption choice or failure evidence.
Verification is relative to the supplied evidence; it is not authorship
authentication or proof of quantum advantage.

## Validation

Backend tests cover exact/tolerance/different verdicts, incomplete values,
source/artifact binding, full matrix definitions, stale environment refusal,
uncertain submission, idempotent start, failure retention and durable recovery.
The browser journey checks that preparation creates no run, explicit reproduction
creates one run without changing drafts, all three QAOA artifacts are checked,
the report downloads and refresh restores its result. Scripted Agent orchestration
uses the real local SDK; no model calls are made.

The existing real-model QAOA research ZIP was also imported and reproduced in a
separate temporary local SDK workspace. All three circuits and count outputs
matched exactly; optimized probabilities differed only within the published
numeric tolerance. That independent report preserves the original source hash
and the new run identity.

## Runtime inventories and preparation guidance

`flagqai.runtime-environment.v1` captures Python implementation/version, OS and
architecture, virtual-environment/user-site/PYTHONPATH facts, bounded installed
package versions and observed module-to-distribution mappings. It distinguishes
the imported SDK module version from distribution metadata. It records a bounded
SDK Python/native-code fingerprint, a wheel hash when the installation receipt
provides one, and an exact VCS revision only when official-repository installation
metadata supplies it. No credential-bearing repository URLs, arbitrary direct URLs
or environment variable values are exported. The code fingerprint excludes data,
bytecode and packaging metadata; its scope is explicitly recorded.

The fixed preflight probe does not install anything or execute archived source.
Missing SDK/PyTorch or unresolved static imports produce a durable **blocked**
preparation receipt with actionable guidance. Start on a blocked receipt cannot
submit a run. Static imports include conditional imports and cannot establish all
possible dynamic dependencies; unresolved import names are never guessed as PyPI
package names. Archive reading still requires a configured SDK reader.

New Python runs capture the same inventory after execution in their immutable run
snapshot. Research-package run JSON preserves it without a new ZIP schema. Older
packages remain readable: missing original package pins, wheel identity and source
revision are explicitly unknown. The current inspected environment is not
retroactively labeled as the old run's requirements.

Environment manifest & preparation shows dependency comparisons, platform, code
identity and explanatory notes. Download environment manifest exports original and
current facts. Preparation commands are copyable POSIX examples for manual review;
there is no install endpoint. Commands pin recorded versions when available,
label current-version candidates, require a verified SDK wheel when original
source identity is unknown, and include dependency consistency checking. A known
wheel hash is shown. Package names, versions, revision and Python-version comments
are validated before command construction; archive-provided URLs and shell text
are not executable instructions. These inventories are not complete hash lockfiles
or cross-platform compatibility guarantees.

## Clean-environment acceptance

`tests/clean_reproduction_acceptance.py` is an explicit local acceptance runner,
not part of import or normal environment checking. Run it with a newly created
virtual environment's interpreter, no user site, no PYTHONPATH/PYTHONHOME and a
non-editable installed SDK. It requires the expected archived source hash before
executing an existing trusted package. Pass a copied standalone local-service
runtime with `--runtime-code`, the trusted ZIP with `--package`, a fresh
`--workspace` and `--expected-source-sha256`. An optional `--missing-python` checks
that an empty interpreter produces a blocked receipt and no execution.

The runner checks SDK installation/wheel/code identity, import without execution,
explicit one-run reproduction, all three QAOA comparisons, restart-readable
verification, idempotent start, retained original evidence/failures and an
independent draft sentinel. Its JSON report keeps the observed runtime inventory
and separately identified SDK build revision; a supplied build revision is not
presented as a revision discovered by the runtime probe. No Agent or model request
belongs in this acceptance.
