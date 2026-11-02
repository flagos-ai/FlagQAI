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
