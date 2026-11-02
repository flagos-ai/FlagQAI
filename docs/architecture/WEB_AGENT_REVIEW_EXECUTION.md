# Reviewed Agent edits and execution

The existing Review changes dialog remains the entry point. It now supports
three-way inspection, independent model snapshots and explicit accept-and-run.
Native Harness ownership of Agent execution, tools and history is unchanged;
these controls do not submit a model message or add an Agent loop.

## Review and local versions

A review captures file ID/revision, model name/language, shared base, current
browser draft and Agent proposal. The normal diff stays visible; shared-base
comparisons with both draft and proposal are available in a collapsed section.
Incoming changes can still be accepted, rejected or manually merged. Existing
undo and stale-review controls remain available.

Save proposal as independent version adds the frozen proposal to My models.
Save reviewed version does the same for the editable merge. Both preserve current
source, undo history, links, project tabs and disk files. A distinct name and
reviewOrigin file/revision metadata identify the snapshot. Identical saved
proposals are deduplicated. Versions use existing browser workspace persistence
and backup error reporting; they are not written to the project or cloud.

## Execution boundary

Accept & run validates the decision against the current editor and incoming
revision, then derives an immutable accepted-source snapshot. For synchronized
code with newer local edits, those edits are preserved and are the execution
source. An incoming manually edited merge executes exactly that merge.

Python syntax checking happens before applying the acceptance. The file revision
is read again and the current editor identity is checked after asynchronous
validation. A stale comparison, changed model, syntax error, busy submission or
unreviewed/unsaved open project dependency prevents submission. No automatic retry
occurs. Reviewed project entries run via existing frozen project snapshots without
writing the entry or dependencies to disk. Users must explicitly review/save
other changed dependencies first.

After validation, acceptance is dispatched once and the captured source is passed
to the existing Python/native workbench submission path. The response must report
the same source. Submission errors retain the accepted draft and existing history;
ambiguous transport failures do not trigger resubmission. Runtime failure is a
normal retained Python run, not a reason to discard or silently revert the edits.
Undo restores the prior browser draft without deleting runs or changing disk.

Accept & compile uses the existing OpenQASM lint and compiler with explicit source
and name arguments. The ModelPage callback must forward those arguments; compiling
through a no-argument wrapper would incorrectly compile the old render's draft.

## Local acceptance

Unit tests cover three-way snapshots, compare-and-swap guards, newer local edits,
independent version deduplication/persistence and merge undo. Isolated browser
acceptance covers syntax refusal without a run, Agent updates during delayed
validation, real runtime failure, exact merged-source SDK execution, duplicate
click protection, untouched disk contents, refresh and historical failure access.
A separate OpenQASM case checks that the accepted proposal is actually compiled
and remains undoable. All tests are local; no paid model verification is required.
