# Agent inspection and presentation of saved research

This PR extracts saved research presentation from the original workspace and
connects it to the existing native tool and Follow Agent paths. Candidate edits,
verification/adoption controls in the Agent outcome card, and research package
export remain separate follow-ups.

## Data path

`workbench_inspect(resource=research_run, id=...)` reads an existing local record.
Its default projection keeps saved status, error, source SHA-256, comparisons,
current baseline identity/revision, and export hashes while omitting large report
bodies and history. Long text and export-list truncation are explicit; `detail=full`
returns the retained record. Existing `resource=research` source-version inspection
is preserved for the coordinator workflow.

`workbench_present_research_run` re-reads the saved record through the
workspace/session-bound bridge before journaling a presentation target and a
compact snapshot of actual metrics/source identity. Stable request IDs deduplicate
identical retries and reject reuse for different inputs. Presentation neither
executes code nor verifies/adopts a candidate.

The browser resolves the saved target again before selecting it in Jobs. An
invalid/missing/mismatched target cannot change selection. Follow Agent controls
automatic navigation; when disabled, receiving a presentation does not read its
target or interrupt the current page. Editor source, undo, file links, and chat
drafts are retained. No new page or outcome card is introduced in this PR.

## Verification

- All 199 pinned SDK tests pass without skips, including the local bridge test
  for saved status/version reads, journal receipt deduplication, request-ID reuse,
  invalid IDs, session changes, and zero compute-adapter calls.
- All 304 Web unit tests pass, including target identity resolution and preservation
  of editor source, file link, and undo state.
- All 27 native workbench/coordinator tests pass, including compact/full reads,
  explicit truncation, source/status retention, and mismatched response rejection.
- Eight browser research-result scenarios pass. The new case connects the scripted
  local Agent without sending a prompt, presents actual saved fixture records,
  confirms Follow-on navigation and Follow-off non-navigation after the event is
  received, retries the same presentation, refreshes, and checks both drafts.
  Report bytes and Python/compute run IDs remain unchanged.
- The new tools pass from a separately extracted CLI archive with no source-module
  imports or dependency installation. Network access is forbidden inside that
  offline tool test. Its verification is included in the existing CLI CI job.
- CLI compilation/type checks, Web type/build/format checks, and staged package
  verification pass. The browser records are synthetic verifier fixtures; these
  tests do not assert autonomous research or scientific result quality.

Original worktree state and the 16 protected draft/research product checksums are
unchanged. Running local services are not restarted. No paid models are called.
