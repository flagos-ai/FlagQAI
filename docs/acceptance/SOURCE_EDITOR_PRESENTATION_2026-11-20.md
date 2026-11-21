# Source editor presentation

Python and OpenQASM share the Notebook workspace's neutral document surfaces,
compact command groups and restrained borders. Document identity and Agent sync
remain together; editing, reference/environment and run commands form separate
groups on the same adaptive toolbar. Reference still stages a snapshot without
sending it. Narrow panes hide secondary labels while retaining accessible names
and tooltips. Document navigation wraps instead of clipping.

The editor uses one rounded code surface and a subtle focus border. The textarea
and syntax layer share their font and padding; the line-number gutter stays above
horizontally scrolled syntax. Streamed Agent source remains a separate read-only
preview. The status bar is compact, and Python Output and OpenQASM Diagnostics use
matching headings and separators. Diagnostic messages retain source navigation.

No execution, compilation, persistence or permission behavior changed. Existing
source and chat drafts, review actions, failure history, focus mode, output compact
mode and manual panel resizing remain available.

Acceptance:

- Eight Chromium scenarios passed, including responsive geometry at 1,920, 1,440
  and 1,000 px, independent language drafts, refresh and manual output sizes.
- Existing scenarios exercised real local Python execution, compact output,
  reviewed OpenQASM compilation, streamed source previews and draft recovery.
- All 320 frontend tests, TypeScript, production build, formatting and staged
  package surface verification passed. The CLI implementation is unchanged.
- No paid model calls were made. Browser scenarios use an isolated workspace.
