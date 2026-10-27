# Shared client projection

`@flagqai/ui-core` owns the backend-neutral AgentEvent reducer and pure token,
transcript-preview, selection-record, bounded live-output, activity/job rosters, agent-message
observations and durable history-restoration folds. It imports
no CLI, browser, Harness or vendor runtime. Native events must be translated to
`packages/protocol/agent` events before folding.

The `.mts` modules are authoritative typed source; corresponding `.mjs` files
are checked-in ES2024 runtime output. The CLI compile gate checks that the two stay identical after TypeScript
transpilation and type-checks the authoritative reducer. Keep the exhaustive event switch;
run the native agent-domain and projection-golden gates after edits.

Hosts inject localization, terminal-width sanitization, questionnaire formatting,
read-cache invalidation, debug logging and timers. Activity output reads remain
host capabilities; disposal fences late reads and cancels watched-job timers.
Scratch history replay disposes its activity fold before returning settled rows. Runtime actions, permissions and
persistence stay with their owning backend. CLI and server-side Web sessions use
this same reducer through the thin native presentation binding; Web paints its
published rows and does not create a competing event fold.

This is the first actual UI-core boundary. Native Harness-specific activity feeds, command
state and Desktop remain migration work; this package does not imply those are
finished. The package is private and requires the sibling protocol declarations.

Derived from dsh-TUI, imported upstream commit
`c2eee95218d1decfce138f7d31ef7099cc391d00`
(<https://github.com/ccch1mneyyy/dsh-TUI>). The original MIT license is retained in
`LICENSE`. FlagQuantum extracted the reducer, introduced typed host seams and
shared package staging, activity/timer seams and durable history restoration; its native behavior remains covered by existing goldens.
