# Stream usage source inputs

Issue #93. The replacement for `dsh-adapter/channel/usage.ts` uses the
published `StreamChunk` declaration and `isTokenDelta` export in
`@deepseek-ai/dsh-llm/assistant-stream` at `0.2.1-rc.2`. It retains the shared
FlagQAI token-estimation and zero-usage helpers in `src/channel/usage.ts`.
Harness now owns the first-token classification; the adapter reports character
progress for text, reasoning, and tool-call fragments and accepts a finite,
nonnegative numeric provider output count.

The implementation was written from that public contract, call-site needs,
and black-box observations of the existing adapter's output. Its old
implementation body was not used as a source. The implementer has prior
exposure to the imported repository, so this is not a strict clean-room claim
or a rights clearance. Other historical source portions, imported notices,
and private history remain in the release rights review.
