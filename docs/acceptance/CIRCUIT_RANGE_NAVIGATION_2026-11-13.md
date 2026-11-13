# Circuit range navigation acceptance

Date: 2026-11-13

Anonymous saved circuits previously appeared as one large ungrouped module.
The viewer now divides them into ordered gate ranges, with at most six children
per range and eight gates per leaf. This is a navigation fallback, not inferred
arithmetic or algorithmic semantics. Named source modules remain intact.

Small circuits show gates directly by default. Collapse all still provides a
selectable, expandable range. Overview, gate ranges, all gates and manual
expansion retain exact instruction order and coverage. Range cards use compact
summaries and wire connectors rather than filling the participating wire span.

## Verification

- Web typecheck, build and formatting passed.
- Full Web unit suite: 246 passed, zero failures or skips. Range tests cover
  empty, small, 81-gate and 2,000-gate circuits; named modules; immutable archived
  hierarchies; and exact coverage across detail presets.
- Two isolated Chromium tests passed with the local FlagQuantum SDK: a saved
  16-qubit/81-gate archive exercises overview, nested expansion, keyboard
  selection, all gates, Fit, no extra Python submissions and editor draft
  preservation. Existing viewport acceptance checks tall-wire Fit, centered
  zoom, manual resizing, small-circuit collapse, source previews and clipboard.
- The height-constrained Fit fixture uses a wider short viewport and waits for
  layout; collapsed selection now names the actual range rather than ungrouped.
- Screenshots of range cards and viewport interactions inspected locally.
- Staged CLI package verification passed: 2,666 files, 32 entry targets. No CLI
  source or installed runtime behavior changed; the hierarchy helper is Web-only.

Browser tests use independent services and a temporary workspace. No paid model
was called, and the user's running services, drafts and research artifacts were
not used for acceptance. Gate ranges never rewrite the saved circuit or archive.
