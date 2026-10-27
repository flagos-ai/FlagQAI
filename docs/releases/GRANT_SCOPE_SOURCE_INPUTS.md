# Grant scope and store replacement inputs

Issue #93. `apps/cli/src/adapter/standard/permission-scope.ts` and
`apps/cli/src/adapter/standard/grants.ts` were independently implemented from
their generated declarations, the pinned `tui-profile` permission registry,
production call sites, and external plugin-grant/message/storage/shadow tests.
The historical imported implementation bodies were not implementation inputs.

The permission scope policy keeps storage within one component namespace,
command IDs exact, session IDs opaque and bounded, and DecisionEvents confined
to their declared event point or concrete session. An event grant can cover a
session; a session grant cannot authorize an event subscription. Malformed or
unreadable grant files fail closed, explicit denies win over grants, activation
IDs must match, and a file change revokes a running grant-owned effect. The
legacy string-only grant rows cannot authorize; a legacy unscoped deny still
revokes an allow-default permission at every otherwise valid scope. The
store reads the file for every decision and shares a 50 ms content-change poll
among subscribers in one directory, closing it after the last unsubscribe.
This avoids per-activation file-watch exhaustion while the next operation
still observes a revocation immediately.

These two replacements do not clear the remaining imported terminal, backend,
or private-history rights questions. Existing upstream notices remain. Native
Windows and hosted CI acceptance remain separate release requirements.

The pinned historical-candidate screen at this branch head found 57 candidates:
zero byte-identical at the old path, 46 modified at the same path, and 11
absent at the old path. This measures blob continuity only, not rights to the
modified portions or private Git history.
