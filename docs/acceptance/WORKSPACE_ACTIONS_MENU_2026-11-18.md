# Compact workspace actions

This extraction groups Research, Backups and User Guide in the header's Workspace
actions disclosure. The selected compute environment remains directly visible.
Existing research-package, backup and guide components and their data operations
are retained; no new page, execution path or storage format is introduced.

The trigger has an explicit button role and accessible name, supports native
Enter/Space activation, and keeps the normal Tab order through its actions.
Escape closes an expanded menu and returns focus to the trigger without also
closing the Agent panel. Outside pointer presses dismiss it. While any modal is
open, these dismissal handlers defer to the dialog so its content and return
focus remain intact. The menu stays mounted while its existing dialogs are used.

## Verification

- All 310 Web unit tests pass. Web type/build/format checks pass.
- The new isolated browser case covers keyboard activation, Tab, Escape, outside
  dismissal, opening and closing all three dialogs, return focus, retention of the
  Agent panel/chat draft and editor draft, refresh, and no new compute/Python jobs.
- Browser bounds checks pass at 1440, 1024 and 800 pixel viewport widths. Screenshots
  at 1440 and 800 pixels were inspected; the menu stays inside the viewport.
- Existing backup draft recovery passes. The existing scripted-Agent QAOA reference
  case passes real local SDK optimization, comparison, independent research-package
  import and saved-result reproduction through the relocated Research action.
  The new menu case was rerun after fixing the Escape propagation conflict.
- Staged CLI package verification passes (2671 files, 32 entry targets). Native
  package source and runtime are unchanged; another installed-native acceptance
  is not required for this UI extraction.

All Agent behavior in acceptance is scripted; no paid model is called. Original
worktree status and all 16 protected draft/research-product checksums remain
unchanged. Existing local services are not restarted.
