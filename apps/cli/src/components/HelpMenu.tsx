import React from 'react'
import { Box, ScrollBox, Text, type ScrollBoxHandle } from '../ui.js'
import type { LocalCommand } from '../commands.js'
import { localizedDescription } from '../commands.js'
import { t } from '../i18n.js'
import { primaryComboString } from '../utils/keymap.js'
import { modLabel } from '../utils/modifiers.js'

interface HelpMenuProps {
  commands: readonly LocalCommand[]
  viewportHeight?: number
  viewportWidth?: number
  scrollRef?: React.Ref<ScrollBoxHandle>
  onCommandPick?: (name: string) => void
}

/** Keep shortcut labels in one place for both the wide and narrow layouts. */
function shortcutGroups(): readonly [readonly string[], readonly string[]] {
  return [
    [
      t('help-for-commands'),
      t('help-this-help'),
      t('help-verbose-output', { key: primaryComboString('transcript') }),
      t('help-open-trajectory', { key: primaryComboString('trajectory') }),
      t('help-search-history', { key: primaryComboString('history') }),
      t('help-interrupt'),
      t('help-exit'),
      t('help-redraw', { key: primaryComboString('redraw') }),
    ],
    [
      t('help-clear-input'),
      t('help-history-nav'),
      t('help-move-cursor'),
      t('help-word-jumps', { mod: modLabel }),
      t('help-complete-command'),
      t('help-cycle-mode'),
      t('help-open-editor', { key: primaryComboString('editor') }),
      t('help-fold-todos', { key: primaryComboString('todoFold') }),
    ],
  ]
}

function ShortcutColumn({ lines, width }: { lines: readonly string[]; width?: number }): React.ReactNode {
  return (
    <Box flexDirection="column" flexShrink={0} {...(width === undefined ? {} : { width })}>
      {lines.map((line, index) => <Text key={index} dimColor wrap="truncate-end">{line}</Text>)}
    </Box>
  )
}

function CommandRow({ command, onPick }: { command: LocalCommand; onPick?: (name: string) => void }): React.ReactNode {
  const [hovered, setHovered] = React.useState(false)
  return (
    <Box
      flexShrink={0}
      onClick={onPick === undefined ? undefined : () => onPick(command.name)}
      onMouseEnter={onPick === undefined ? undefined : () => setHovered(true)}
      onMouseLeave={onPick === undefined ? undefined : () => setHovered(false)}
      backgroundColor={hovered && onPick !== undefined ? 'userMessageBackgroundHover' : undefined}
    >
      <Text dimColor wrap="truncate-end">/{command.name} — {localizedDescription(command)}</Text>
    </Box>
  )
}

function CommandColumn({ commands, onPick }: { commands: readonly LocalCommand[]; onPick?: (name: string) => void }): React.ReactNode {
  return (
    <Box flexDirection="column" flexShrink={0}>
      <Text dimColor>{t('help-commands-title')}</Text>
      {commands.map(command => <CommandRow key={command.name} command={command} onPick={onPick} />)}
    </Box>
  )
}

/** Shortcut reference with a bounded, keyboard-and-mouse-scrollable command list. */
export function HelpMenu({ commands, viewportHeight, viewportWidth, scrollRef, onCommandPick }: HelpMenuProps): React.ReactNode {
  const [primary, secondary] = shortcutGroups()
  const visibleCommands = commands.filter(command => !command.skill)
  const commandColumn = <CommandColumn commands={visibleCommands} onPick={onCommandPick} />

  // A standalone help view grows with its contents. Only the prompt overlay
  // supplies a viewport; it owns the arrow, page, home, end and wheel keys.
  if (viewportHeight === undefined) {
    return (
      <Box flexDirection="row" paddingX={2} gap={4}>
        <ShortcutColumn lines={primary} width={26} />
        <ShortcutColumn lines={secondary} width={24} />
        {commandColumn}
      </Box>
    )
  }

  const narrow = viewportWidth !== undefined && viewportWidth < 72
  return (
    <Box height={viewportHeight} flexDirection="column">
      {narrow ? (
        <ScrollBox ref={scrollRef} flexGrow={1} flexShrink={1} flexDirection="column" paddingX={2}>
          <ShortcutColumn lines={primary} />
          <ShortcutColumn lines={secondary} />
          {commandColumn}
        </ScrollBox>
      ) : (
        <Box flexDirection="row" flexGrow={1} paddingX={2} gap={4}>
          <ShortcutColumn lines={primary} width={26} />
          <ShortcutColumn lines={secondary} width={24} />
          <ScrollBox ref={scrollRef} flexGrow={1} flexShrink={1} flexDirection="column">
            {commandColumn}
          </ScrollBox>
        </Box>
      )}
      <Box flexShrink={0} paddingX={2}>
        <Text dimColor wrap="truncate-end">{t('help-scroll-hint')}</Text>
      </Box>
    </Box>
  )
}
