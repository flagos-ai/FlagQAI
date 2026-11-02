# Portable research packages

The Research button opens a server-persisted catalog of imported research
records. Export research package in a QAOA research record downloads a standard
ZIP. Import research ZIP restores it as an independent record without changing
the editor or starting Python or Agent execution. Existing JSON manifest export
and individual original `.fqx` downloads remain available.

## Format and identity

`manifest.json` uses `flagqai.research-package.v1` and indexes every other ZIP
entry by byte length and SHA-256. The package contains:

- `research.json`: the `flagqai.research-record.v1` evidence manifest, request,
  version lineage, failure summaries and validated adoption note.
- `runs/{original-run-id}.json`: terminal run snapshots and recorded environment.
- `sources/{original-run-id}.py`: exact UTF-8 source matching its source hash.
- `artifacts/{original-artifact-id}.fqx`: unmodified SDK archive bytes.

Export reads authoritative run snapshots and archive files rather than trusting
client metric summaries. Imported packages can be re-exported independently of
the original native run database. The original `.fqx` format is unchanged.

Every import receives a fresh research ID and fresh local artifact IDs. Original
run and artifact identities stay in the archived evidence namespace; they are
not inserted as new Python runs. A local-ID mapping enables circuit previews and
comparison. Repeated imports cannot replace an earlier record. Adoption overrides
are scoped to the imported record in browser storage, and exports carry the
current validated choice. A validated adopted version is initially selected;
subsequent explicit version selection is retained.

## Validation and commit

The server bounds compressed and expanded size to 64 MiB, entries to 512 and
recorded runs to 64. Individual `.fqx` files retain the 16 MiB upload limit and
sources the 32 KiB limit. Only single-file research is supported; project
dependencies are refused rather than omitted silently.

Import rejects unsupported schemas, unsafe paths, duplicate or unindexed entries,
symlinks, encryption, unsupported compression, incomplete artifact collection and
source/archive hash mismatches. Integrity hashes detect changed bytes; they do not
authenticate who produced the evidence. Packages are not signed.

All artifacts are first read with the configured SDK in the existing isolated
experiment reader using a temporary staging database. Code in the package is
never executed by import. Only a completely validated package is committed.
Commit failure removes only newly owned files and records. Original ZIP bytes
and restored records persist under the service data root.

## Reproduction

Imported evidence is explicitly labeled as having no local execution. Recorded
SDK, backend, device, shots and seed appear under Reproduction preparation.
Check configured runtime reads environment metadata without executing the source;
it does not claim compatibility or bundle dependencies.

Open source in editor creates an independent model and uses the existing
draft-preserving action. Run Python remains explicit and creates a new local run.
Archived logs can be inspected without the original native run service. Import
does not reconstruct a native Agent session or introduce another Agent loop.

## Verification

Focused backend tests cover ZIP validation, staged-reader failure, rollback,
namespace isolation and independent re-export. The QAOA browser journey tests a
damaged package, independent repeated imports, adopted-version restoration,
archived logs, circuit/comparison links and refresh in a clean browser. Native
run-detail requests are blocked during archive review. It confirms no new run on
import, preserved drafts and a matching real-SDK result only after explicit Run
Python. No paid model calls are required.

Verify reproduction now adds environment preparation, explicit independent
execution and a persistent result verdict directly in the selected record. See
[Explicit research reproduction](WEB_REPRODUCTION_VERIFICATION.md).

## Verification history in v2 deliveries

Exports now write `flagqai.research-package.v2`; the reader still accepts v1
packages without verification history. Original `.fqx` bytes and the research
record schema are unchanged. Existing export/import controls carry the new data;
there is no extra page or export button.

V2 adds `verifications/{snapshot-sha256}.json`,
`verification-runs/{original-reproduction-id}.json` and
`verification-sources/{original-reproduction-id}.py`. Reproduction archives remain
in the hash-indexed `artifacts/` directory. A verification envelope uses
`flagqai.archived-verification.v1`; its canonical digest identifies the complete
immutable report snapshot, retaining original report ID, package context, source,
original/new artifact references, environment, verdict, failure reason and time.
Referenced terminal run snapshots retain their code, runtime, collection errors
and bounded original logs. Prepared/blocked checks can travel without a run.
Active verifications refuse export rather than being silently omitted. A receipt
whose run snapshot is unavailable remains non-conclusive and cannot claim a pass.

The exporter includes all matching current verification history plus previously
archived snapshots. It does not reclassify imported reports as local receipts.
Identical snapshots deduplicate by digest; different snapshots remain separate.
An omitted adoption field retains the package choice, while explicit null still
clears it. Limits are 64 research runs, 64 reproduction runs, 128 reports, 512 ZIP
entries and 64 MiB total; exceeding limits produces an error, not a partial export.

Import validates original source/archive identity, independent replay source,
report-to-run/artifact references and conclusive run completion. It stages SDK
reads of both original and reproduction `.fqx` archives, then recomputes conclusive
verdicts, comparison columns and objective metrics before committing any files.
Contradictory positive claims, changed sources, missing evidence or incorrect
artifact links are refused. Existing numeric tolerances apply to derived metric
recalculation. Recorded failures remain failures; import does not upgrade them.
Hash checks and saved-result comparison do not authenticate an author's identity
or independently prove that an archived execution happened.

Imported snapshots live only under the new research package namespace. They are
not inserted into PythonRuns or the local verification receipt database. Research
version counts do not grow because replay evidence was bundled. Repeated imports
receive independent package and local artifact IDs. Re-export retains original
snapshot digests/context and adds the new namespace's explicitly created checks.

## Existing UI and delivery summary

The research conclusion keeps the adopted source and decision reason. Its compact
verification summary separates archived and current-environment counts, scopes
results to the adopted source (or explicitly labeled selected source), identifies
the latest current attempt and retains older passing/failing checks. It displays
recorded environment context and remaining differences without treating an
imported pass as a current check.

Existing reproduction history cards label their scope. Archived cards are read
only: they cannot start or cancel runs, and their logs come from the bundled
snapshot rather than a native run endpoint. Archived preparation commands are
not offered as current installation guidance. Existing report download controls
preserve both supplied evidence and the independently recomputed import result.
Only the existing explicit reproduction action creates a local receipt/run.

`tests/research_delivery_acceptance.py` exercises an existing trusted QAOA record
with an expected source hash: export, fresh independent import, no run on import,
explicit SDK re-verification, unchanged draft/evidence, second export/import and
separation of all imported reports from the new local stores. It uses no Agent
or model calls.
