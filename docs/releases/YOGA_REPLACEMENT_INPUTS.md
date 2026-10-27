# Official Yoga layout replacement inputs

This batch replaces the two imported TypeScript Yoga-port files with the
published `yoga-layout@3.2.1` runtime, pinned in the CLI manifest and lockfile.
The package declares MIT; the Yoga MIT text remains in
`apps/cli/THIRD_PARTY_LICENSES`. The dependency supplies the layout algorithm.
FlagQAI's `src/ink/layout/yoga.ts` adapter maps the terminal renderer's typed
layout operations to its public API.

## Inputs and preserved behavior

- Source input: the published `yoga-layout` 3.2.1 package and its public
  `Node`, `Config`, enum, and measure-function interfaces. The historical
  imported port was not used as an implementation template for this adapter.
- Behavior input: the existing terminal's public layout and interaction
  checks, including text wrapping at fractional widths, long-line expansion,
  image preview, hover tooltips, Agent View round trips, and resize behavior.
- Terminal cells require integral painted and hit-tested geometry. The
  official Yoga config therefore uses a point scale factor of one. Its text
  measure callbacks still receive fractional constraints; the adapter retains
  those constraints across Yoga's cached width round trips so measured text
  and painted rows agree.
- Returning from the borrowed Agent View forces one physical redraw. Without
  that boundary redraw, a border cell from the prior view can remain beside a
  narrower transcript row. Scrollback remains intact.

This is one subportion of the embedded terminal host replacement, not a
replacement of the renderer, Chat, or composer. The imported-source rights
review remains open, as do the private-history and release-acceptance items
tracked by issues #86 and #93. Passing behavior tests does not clear rights.

## Validation record

The isolated candidate compiled and passed focused layout, folding, image
preview, tooltip, Agent View, and DOM-mutation checks on macOS. The full CLI
preflight, staged package, and clean installed acceptance must be recorded on
the exact PR head before merge. No hosted or Windows result is implied by
these local checks.
