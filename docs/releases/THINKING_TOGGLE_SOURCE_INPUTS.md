# Thinking display selector replacement input record

This bounded replacement contributes to source-rights issue #93; it does not
clear the current CLI, its renderer, Chat screen, other presentation modules,
or private history for public distribution.

The implementation inputs were the user-visible `verify-thinking-tool-leaves`
screen contract, the `verify-thinking-display` keyboard behavior contract, the
current caller's public prop interface, and the shipped i18n strings. The old
`ThinkingToggle.tsx` implementation body was not used as an input. Maintainers
have previously had access to the imported project, so this is not claimed as
a strict clean-room replacement. The new
component only presents two choices and forwards a clicked choice to its
parent. The parent still owns the setting, keyboard focus and notification;
this component does not change model reasoning or Harness authority.

The replacement uses React and the existing CLI `Box`/`Text` facade. That
facade is still within the unresolved terminal-host replacement boundary, so
this leaf replacement is not a standalone rights disposition. The complete
source and package notices must be reviewed again before any public import.
