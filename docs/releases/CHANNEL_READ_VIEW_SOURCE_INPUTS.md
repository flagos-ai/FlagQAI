# Channel read-view replacement inputs

Issue #93. The replacement in `apps/cli/src/adapter/channel/read-view.ts` was
implemented from its generated public declarations, `adapter/channel/ui.ts`
call sites, and the behavioral assertions in `verify-channel-ui.ts`. The
historical imported implementation body was not an implementation input.

The contract detaches and freezes ordinary records and arrays exposed to the
renderer, guards executable fields with the UI lease, and rechecks the lease
when a returned promise settles. Binary views, Dates, errors, regular
expressions, and class instances retain their native identity and behavior.
In-place source changes must mark each changed record and its containing list;
an activity-only version can reuse historical row snapshots. The regression
also covers nested tool payload refresh, long-transcript row identity, cyclic
records, callback receiver binding, and revocation after async completion.

This is one authority-boundary replacement, not clearance of the dsh-TUI
source family or private Git history. Existing upstream notices remain.

Validation on the candidate: `verify-channel-ui.ts` and TypeScript compilation
passed; the complete CLI preflight passed all 190 gates when local loopback and
Unix sockets were available. An initial sandboxed run passed 184 gates and
failed six before their assertions because local listeners returned `EPERM`.
The staged package passed (2,922 files, 32 entry targets). A fresh installed
macOS arm64 package with managed Harness 0.2.1-rc.2 passed scripted-model Bell,
native Todo/approval/cancellation, and Ink attach/permission/cancellation and
result-detail PTYs. These are local, no-cost tests; they do not prove Windows,
live-model behavior, or source rights.
