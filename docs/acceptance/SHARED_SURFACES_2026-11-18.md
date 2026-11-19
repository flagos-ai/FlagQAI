# Shared workbench surfaces

Define one neutral palette for panels, raised surfaces, fields, dividers, readable
text and semantic status colors. Existing research components already reference
these tokens; they now resolve consistently. Apply the original shared surface
rules to pane headers, Jobs rows, recorded result tables, configuration sections
and dialogs. Blue remains the action accent and keyboard focus stays visible.

This extraction leaves editor and circuit geometry, chart colors, splitter
behavior and owner-specific layouts with their existing components. Obsolete
selectors for earlier synthesis and Agent component implementations are excluded.

Validation: Web type checking, production build and formatting passed. Full
local browser acceptance exercises the integrated extraction using fixed Agent
fixtures and the local SDK, with no paid model calls. The library's 1024 by 600
view was visually inspected before this palette-only extraction.
