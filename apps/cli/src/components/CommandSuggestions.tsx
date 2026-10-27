import React from 'react'
import { Box, Text } from '../ui.js'
import { stringWidth } from '../ink/stringWidth.js'
import { truncateToWidth } from '../ink/truncateToWidth.js'
import type { Color } from '../ink/styles.js'
import type { Theme } from '../theme.js'
import type { LocalCommand } from '../commands.js'
import { localizedDescription } from '../commands.js'
import { t } from '../i18n.js'
import { POINTER } from '../terminal-utils/figures.js'
import { SuggestionCard, cardContentWidth, splitQueryMatch } from './SuggestionCard.js'
import { useTooltip } from './Tooltip.js'

type Entry = LocalCommand & { descriptionKey?: string }
const VISIBLE_ROWS = 5

function fit(text: string, width: number): string {
  if (width <= 0) return ''
  return stringWidth(text) <= width ? text : `${truncateToWidth(text, width - 1)}…`
}

function CommandRow({ command, selected, held, query, usable, nameColumn }: {
  command: Entry
  selected: boolean
  held: boolean
  query: string
  usable: number
  nameColumn: number
}): React.ReactNode {
  const name = command.name
  const description = `${command.tag ? `[${command.tag}] ` : ''}${localizedDescription(command)}`
  const gutterWidth = 3
  const nameBudget = Math.min(nameColumn, Math.max(0, usable - gutterWidth))
  const displayedName = fit(name, nameBudget)
  const namePadding = ' '.repeat(Math.max(0, nameColumn - stringWidth(displayedName)))
  const descriptionBudget = Math.max(0, usable - gutterWidth - nameColumn)
  const displayedDescription = fit(description, descriptionBudget)
  const tooltip = useTooltip(() =>
    displayedName !== name || displayedDescription !== description
      ? `/${name}\n${description}`
      : '')
  const match = !selected && !held ? splitQueryMatch(displayedName, query) : null
  const gray = held && !selected ? 'subtle' : undefined

  return (
    <Box {...tooltip}>
      <Text wrap="truncate">
        {' '}
        {selected ? (
          <Text color={gray ?? 'suggestion'} bold>{`${POINTER} ${displayedName}${namePadding}`}</Text>
        ) : match ? (
          <>
            <Text dimColor>{`  ${match.before}`}</Text>
            <Text>{match.match}</Text>
            <Text dimColor>{`${match.after}${namePadding}`}</Text>
          </>
        ) : (
          <Text color={gray} dimColor={!held}>{`  ${displayedName}${namePadding}`}</Text>
        )}
        <Text color={selected ? gray ?? 'suggestion' : gray} dimColor={!selected && !held}>
          {displayedDescription}
        </Text>
      </Text>
    </Box>
  )
}

/** The slash-command card shared by the launchpad and in-session composer. */
export function CommandSuggestions({
  commands,
  selectedIndex,
  columns,
  query = '',
  accent,
  holdFrom,
  onPick,
  onWheelStep,
}: {
  commands: readonly Entry[]
  selectedIndex: number
  columns: number
  query?: string
  accent?: keyof Theme | Color
  holdFrom?: number
  onPick?: (index: number) => void
  onWheelStep?: (step: 1 | -1) => void
}): React.ReactNode {
  if (commands.length === 0) return null

  const selected = Math.min(commands.length - 1, Math.max(0, selectedIndex))
  const lastSeparator = Math.max(query.lastIndexOf(' '), query.lastIndexOf('\t'))
  const queryToken = query.slice(lastSeparator + 1).replace(/^\//, '')
  const usable = cardContentWidth(columns)
  const nameColumn = Math.min(
    Math.max(...commands.map(command => stringWidth(command.name))) + 5,
    Math.floor(usable * 0.4),
  )
  const first = Math.max(0, Math.min(
    selected - Math.floor(VISIBLE_ROWS / 2),
    commands.length - VISIBLE_ROWS,
  ))
  const visible = commands.slice(first, first + VISIBLE_ROWS)
  const above = first
  const below = commands.length - first - visible.length
  const footer = above || below
    ? [
        above ? t('sugg-more-above', { n: above }) : null,
        below ? t('sugg-more-below', { n: below }) : null,
      ].filter(Boolean).join(' · ')
    : null

  return <SuggestionCard
    title={`${t('sugg-commands-title')} · ${t('sugg-count', { n: commands.length })}`}
    columns={columns}
    accent={accent}
    footer={footer}
    onRowPick={onPick ? row => onPick(first + row) : undefined}
    onWheelStep={onWheelStep}
    rows={visible.map((command, offset) => <CommandRow
      key={`${first + offset}:${command.name}`}
      command={command}
      selected={first + offset === selected}
      held={holdFrom !== undefined && first + offset >= holdFrom}
      query={queryToken}
      usable={usable}
      nameColumn={nameColumn}
    />)}
  />
}
