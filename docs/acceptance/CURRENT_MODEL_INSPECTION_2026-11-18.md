# Current model inspection

The native workbench inspection tool accepts `resource=model` without an ID.
It reads the active client/session status, then reads its exact shared model ID
or returns the unsaved browser draft explicitly marked `browser_draft`. Display
names are never treated as file IDs. Explicit IDs retain the direct-read path;
other resources still require their original IDs. No code is shared or executed.
A session change between the two reads stops the operation.

Validation: CLI source compilation, type checking, 16 workbench tool tests and
staged package verification passed. An independently extracted package exercised
both draft and shared-model reads offline alongside saved research presentation.
No paid model calls, user-draft writes or local service restarts.
