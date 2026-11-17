# Local research run evidence

The local workspace service projects saved InvSqrt verifier artifacts into
research run records. The first adapter uses the `invsqrt` directory next to
the configured workspace database. It reads per-run `report.json` files and
supports the older `current.json` pointer. Reports retain the saved run's
status, including failed attempts.

- `GET /api/research-runs` lists project and run summaries.
- `GET /api/research-runs/{id}` returns recorded comparison metrics, scope,
  evidence, and available export links.
- `GET /api/research-runs/{id}/files/{name}` returns the declared artifact
  from a completed run after checking its digest.

Completed evidence requires both verifier outputs at the full recorded shot
count. Each output must match the report and the digest of the corresponding
circuit. Reads reject symlinks, hard-linked files, and paths outside the run.
An integrity error is reported as HTTP 409. The service reads the local
artifacts without launching the verifier or a model. These records describe
local verification under the archived settings.
