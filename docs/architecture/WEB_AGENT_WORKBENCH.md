# Native Agent and workbench reliability

Harness remains responsible for Agent execution, permissions, tools and session
history. The Web client consumes native events and existing workbench actions.

Native workbench tools are registered only after accepting controls for that
exact session. Requests are restricted to loopback, reject redirects, verify
the native workspace directory and recheck the binding before acting. Existing
revision checks and request IDs protect drafts and repeated action delivery.
Waiting does not cancel or resubmit an execution; saved-experiment presentation
checks artifact identity before focusing a circuit or recorded result.

Follow Agent uses session-scoped actions to display model edits, experiments and
comparisons. Navigation-only activity is grouped separately from substantive or
failed work. Tool cards expose native evidence without altering raw records.

Python execution and artifact collection are separate lifecycle stages. Read
outages retain uncertain running status; a stop request is not confirmed until
a terminal run is observed. Errors and repair preparation belong to their run
ID, preventing stale feedback after a history switch. Execution history and
read-only source previews identify their saved source independently of drafts.

Source-checkout serving uses a temporary managed-Harness overlay loading the
checkout's compiled server. Installed provider settings are retained, the
overlay is removed on exit, and published packages keep their installed path.

Regression evidence includes binding/redirect/abort handling, native source
overlay cleanup, CLI package and installed-runtime checks, real CPU SDK backend
acceptance and scripted native-protocol browser journeys. No paid model call is
part of these tests. They do not establish real-model task completion quality.

## Reviewed research and native coordination

Saved research is exposed by identity, source digest and baseline revision.
`workbench_inspect(resource=research_run)` reads recorded metrics and failures;
`workbench_present_research_run` prepares navigation to that exact archive.
Inspecting `resource=model` without an ID resolves the current shared file or
returns an explicitly marked browser draft. A draft is not a saved executable
revision and must not be silently replaced.

`workbench_research_team` is a session-bound adapter to the public Harness
activation, child catalog and persisted session log. A transactional metadata
claim freezes the child identity, task version, constraints and source. Unknown
admission is reconciled against that original child; it is never blindly
redispatched. The workbench ledger records evidence and coordination metadata,
not another Agent loop. See [native binding acceptance](../acceptance/NATIVE_RESEARCH_COORDINATION_2026-11-18.md).

Constraint changes retain old tasks and evidence. Recommendations are reviewed
in the existing record panel; user confirmation reserves new task versions and
does not start a Worker. Coordinator continuation preserves unsent chat text.
See [constraint review acceptance](../acceptance/RESEARCH_CONSTRAINT_REVIEW_UI_2026-11-18.md).

`workbench_inspect_research` returns a bounded candidate source excerpt with its
hash and project revision. `workbench_propose_research_candidate` requires that
exact version and a stable request ID, and stages one reviewable replacement.
It cannot verify or adopt its own candidate. Existing user-triggered review,
verification and baseline controls remain the mutation boundary.

`workbench_export_research` delivers the existing research-package format from
recorded run IDs. The bridge journals stable request IDs and the download route
checks the immutable package digest. Export and retry do not submit computation.
See [package acceptance](../acceptance/AGENT_RESEARCH_EXPORT_2026-11-18.md) and
[candidate tool acceptance](../acceptance/AGENT_RESEARCH_CANDIDATE_TOOLS_2026-11-18.md).

Live activity summaries render actual native tools and task metadata. They do not
estimate scientific progress or assert completion before authoritative evidence.
Raw activity, historical failures and completed work remain expandable. Protocol
fixtures and synthetic verification records establish lifecycle behavior only;
scientific correctness and real-model quality require their own evidence.
