# Notebook run evidence

Notebook research copies expose a collapsed recorded-run section in the Python
output and the saved experiment details. It shows the frozen source identity,
recorded runtime, separate execution and collection states, logs, and links to
the original FQX files. Opening these details never restores an editor or starts
a run.

The JSON download includes the recorded run and all frozen project input files.
It checks the entry-source and whole-project hashes before returning data; it
does not read the current project files. Changed or missing snapshots produce an
error instead of silently exporting current inputs. The JSON is evidence, not an
independently runnable environment or a scientific verification report. FQX
archives remain separate downloads. No full notebook kernel or new page is added.

The environment status specifically describes the import/API check bound to the
recorded project hash. Successful execution and collection are not presented as
scientific validation. Legacy runs without a recorded preflight are labeled as
such.

Acceptance covers service restart, later project edits, retained failure/logs,
changed snapshot rejection, missing snapshot errors, and read-only HTTP export.
Browser acceptance uses a local official notebook research copy, verifies the
source/environment/output evidence, downloads the input record and reopens the
saved result after refresh while preserving editor drafts and the run count.
No paid models are involved.

Validation on this change: 219 local workspace tests, 315 Web tests, TypeScript
checking, the Web build, and staged package verification passed. The compatible
SDK browser scenario passed using the real local superposition workflow, then
opened the Jobs evidence without creating another run. The installed CLI code
and package surface are unchanged by this optional Web/local-workspace change.
