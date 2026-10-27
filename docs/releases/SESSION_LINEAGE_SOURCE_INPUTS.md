# Session lineage source inputs

Issue #93. The `childRecordsLineage` replacement uses the published Harness
`SessionEvent` and `UserMessage.source` declarations from
`@deepseek-ai/dsh-session` and `@deepseek-ai/dsh-llm` at `0.2.1-rc.2`, the
`model-session.ts` call site, and the existing `verify-session-title-lineage.ts`
behavior assertions. The historical imported implementation body was not an
implementation input. The implementer has prior exposure to the imported
repository, so this is not a strict clean-room claim or rights clearance.

A model switch records parent lineage only when the seed contains a
`user/message` whose source kind is `user`. Harness can also persist synthetic
user-role context from other sources; that context must not turn a blank
session into a child. The decision does not inspect message text, so an
image-only human prompt counts. Harness continues to own session creation,
events, model switching, title generation, and persistence.

Focused, full-preflight, package, and installed validation results belong to
the exact private PR. The inherited presentation, other exact compiler inputs,
notices, and private history remain in the release rights review.
