# Reviewed Agent edits: local acceptance

No paid model or real-model turn was used. The optional Web UI was exercised with
a scripted native protocol fixture, actual local FlagQuantum SDK computation and
isolated browser profiles. Existing user drafts and the live native conversation
were not modified by acceptance.

## Verified behavior

- Shared base, local draft and Agent proposal remain separately inspectable.
- Saving a proposal or manually reviewed merge creates a distinct My models copy
  with file/revision provenance; current source, link, undo and disk are unchanged.
- The saved copy and protected draft restore after refresh.
- An Agent file update during delayed syntax validation prevents acceptance and
  execution; users must refresh the comparison.
- Python syntax errors do not create a run or replace the current draft.
- A syntactically valid runtime failure creates an ordinary retained failed run;
  Undo Agent change restores the prior draft without removing failure history.
- Accepting and running a manually reviewed merge executes that exact source. Real
  SDK Bell-plus-X measurements produce 01/10, independently of the old baseline.
- Repeated clicks submit once. Merged browser code does not overwrite the watched
  disk file. Saved independent code and failure access survive refresh.
- OpenQASM accept-and-compile forwards the accepted source/name to the compiler,
  checks the actual request source, produces a circuit containing CX and remains
  undoable. The local fixture includes required registers and terminal measurements.

## Visual review

A separate read-only browser fixture checked the default and expanded review
layouts against the running local Web build. Execution and model message routes
were blocked. Saving a local copy and closing the review preserved the fixture's
unsaved draft. These images show a UI fixture, not a new real-model task.

- Default review (`review-modal.png`, local acceptance output)
- Three-way review (`three-way-review.png`, local acceptance output)
- Read-only review result (`result.log`, local acceptance output)

## Automated result

Web build/type checking and all 221 unit tests passed. All 30 browser journeys
passed, including the two new reviewed-execution cases. Product journey acceptance
passed using existing pinned-SDK suite evidence; the standalone 94-test SDK suite
was not rerun for this Web integration. Formatting and diff whitespace checks
passed. No model call was made.


Local acceptance outputs named above are execution records, not committed fixtures.
To regenerate portable evidence without model calls, run the Web browser suite
(`pnpm --dir apps/web test:e2e --trace off`) with an installed SDK, or use
`packages/quantum-workspace/tests/clean_reproduction_acceptance.py --help` and
`packages/quantum-workspace/tests/research_delivery_acceptance.py --help` with a
trusted exported research package. Keep generated archives and runtime logs out
of the source repository.
