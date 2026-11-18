# Workspace research history in the Model project panel

This focused extraction makes existing saved research discoverable from the Model
project panel. The compact section groups runs by their recorded research project
and shows the total count, latest attempt's status, and title. Failed and pending
attempts remain visible. The entry explicitly opens the latest attempt; it does
not claim that attempt is the adopted baseline.

The section is labeled Workspace research because the current research API is
scoped to the local service workspace, not the arbitrary local folder opened in
the file tree. File access and project ownership are unchanged. Opening a saved
record re-reads it, checks the returned identity, and selects the existing Jobs
detail without loading source into the editor. The detail retains comparison,
review, export, verification and baseline controls. An unmounted panel aborts
pending navigation.

The project section and existing Jobs research list share a read-only loading
hook. It refreshes on mount, selected record changes and research-change events;
explicit refresh/retry handles transient failures without periodic list polling.
A failed reload retains the last saved list and labels it potentially stale.
Identity mismatch or a missing record leaves navigation unchanged.

## Verification

- All 310 Web unit tests pass, including new grouping/ordering tests for failures,
  multiple projects, deterministic timestamp ties, invalid navigation IDs and
  preservation of input records.
- All ten isolated research-result browser tests pass. The new case opens the
  latest failed attempt from Model, rejects a mismatched record, recovers from
  list unavailability, finds the earlier verified comparison in Jobs, and returns
  to Model after refresh with chat/editor drafts intact. Saved report bytes and
  Python/compute run IDs are unchanged.
- Two existing project-file browser scenarios pass: multi-file SDK snapshots with
  native scripted-Agent edits/draft review, and file-view/folder-fold restoration
  with keyboard search and save-and-run.
- The project-panel screenshot was reviewed; the compact research section has no
  horizontal overflow at the default sidebar width.
- Web type, build and formatting checks pass. Staged CLI package verification
  passes (2671 files, 32 entry targets). Native package source and runtime are
  unchanged, so another installed-native acceptance is not required.

The verifier reports are saved synthetic fixtures, and the Agent is scripted;
these checks do not claim a new scientific result. The original worktree status
and all 16 protected draft/research-product checksums are unchanged. Existing
services are not restarted and no paid models are called.
