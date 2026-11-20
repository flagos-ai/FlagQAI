# Recorded notebook input environment checks

The existing recorded-run section now offers an explicit environment check for
the original frozen input files. It never restores the editor, submits a Python
task, installs dependencies, or replaces recorded results. Viewing the section
only reads history. The original pre-run check remains separate.

Each later import/API observation is saved in an independent SQLite record with
the run ID, frozen input hash, timestamp, selected environment revision, runtime
facts, and service instance. Keeping these observations separate prevents a
concurrent artifact collection update from overwriting check history or vice
versa. The existing input-record download includes all later observations.

After restart, previous observations remain available but are explicitly
archived. A changed compute selection also invalidates the session label. A
check made in the same service session is still an observation at its recorded
time: this is not a guarantee against subsequent SDK changes on disk or a
scientific verification of the saved results. Failed checks retain preparation
guidance and do not remove earlier observations.

Before probing, the service validates the recorded source and whole-project
snapshot hashes. Missing or changed input snapshots prevent a probe. The import
probe parses local helpers without executing them; installed dependency imports
may execute their normal initialization code, as in the existing preflight.

Validation:

- 222 local workspace tests passed, including real SDK import checks with an
  entry and local helper that raise if executed, restart/archive handling,
  frozen inputs after live project edits, changed environment selection,
  failed check retention, tamper rejection, and read-only HTTP history.
- 315 Web tests, TypeScript checking, the Web build, and staged package checking
  passed (2671 files and 32 entry targets).
- An isolated browser using the real local FlagQuantum SDK checked an official
  superposition notebook copy, saved a later observation, refreshed, reopened
  history and the saved result, and downloaded the report. The research run
  count stayed at one, the original run record stayed identical, and the
  existing unsaved draft remained in browser storage.

The optional Web/workspace change does not change the installed CLI package
surface. No provider credentials, paid model calls, or current user workspaces
were used.
