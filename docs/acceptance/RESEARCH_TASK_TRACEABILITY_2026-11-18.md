# Research task traceability in saved results

This PR extracts the read-only task/evidence presentation from the original
research team UI. Existing conclusions, metric comparisons, downloads, baseline
review, and candidate iteration remain above the collapsed research team section.
No pages or task execution controls are added.

## Behavior

The section reads the existing `coordination` links on a saved research run. Each
task retains its native status, constraint version, worker/coordinator identity,
starting source, verifier, and baseline revision. Verified evidence links open the
actual saved run and show its source/report hashes. A completed worker without
linked verification explicitly says that no verification report is linked.

Tasks under earlier constraints are folded separately and their evidence is
labelled historical. Nested details retain failures, native run IDs, timestamps,
and recovery observations. Task completion never becomes a scientific validation
claim and does not adopt a candidate.

While the team section is expanded, existing run reads refresh every two seconds
if linked tasks are reserved, admitting, or running. Closing the section or
reaching terminal statuses stops that polling. Expansion is controlled for the
selected record, and record updates do not collapse details being read. Browser
refresh starts with the section collapsed; persisted research data and drafts
remain available.

## Local acceptance

- All 300 Web unit tests pass. Type checking, production build, and formatting
  checks pass.
- All five research-run browser tests pass, including the existing baseline,
  lost-receipt candidate revision, and candidate review flows.
- The new browser scenario seeds verified archive fixtures and uses real local
  metadata routes to reserve two tasks, record a failure, link evidence, and
  change constraints. It confirms that metrics precede the collapsed team panel,
  an expanded running task updates after a later completion observation, nested
  failure/evidence history stays available, linked verification opens, and
  refresh preserves the model and unsent chat drafts.
- No Python task or compute job is submitted by the new scenario. The reports
  are synthetic verifier fixtures; no autonomous or scientific result claim is
  made by this UI acceptance.
- The browser screenshot was reviewed. The section adds no fixed header area and
  uses the existing result typography, disclosure controls, and status styles.
- Staged CLI verification passes with the unchanged CLI runtime surface. No clean
  installed CLI rerun is necessary for this Web-only presentation change.

Original worktree state and the 16 protected draft/research product checksums are
unchanged. Existing local services are not restarted. No paid models are called.
