# Agent research package delivery

`workbench_export_research` prepares a package from 1–16 explicit saved Python
run IDs. It uses the existing research-package schema, exact source snapshots,
recorded logs, SDK artifacts and retained verification history. It starts no
computation and adopts no candidate. Single-file package limitations still apply.
The session-bound bridge journals the action using its stable request ID.
Repeated identical requests return the same prepared export, including after a
bridge restart; altered input with the same ID is rejected.

Exports are atomically published under a SHA-256 identity. The download reader
requires a bounded regular file, refuses a final symbolic link and checks its
content hash. The same-origin HTTP route and completed Agent activity card expose
the package. Failed or unfinished preparations expose no download link.

Validation: 6 package tests, 11 bridge tests, 16 HTTP tests, 15 native tool tests
and 4 activity-rendering tests passed, together with CLI compilation, Web type
checking, build, formatting and staged package verification. An independently
extracted CLI exercised the export tool offline. An isolated browser scenario ran
the real local SDK QAOA reference, collected three artifacts, exported and hashed
the ZIP, reloaded, retried with the same ID and independently imported its source
and artifact hashes. No extra Python run was submitted; chat/editor drafts stayed
intact. No paid model calls or live service restarts.
