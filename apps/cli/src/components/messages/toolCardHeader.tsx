import React from 'react'
import { Box, Text } from '../../ui.js'
import { stringWidth } from '../../ink/stringWidth.js'
import type { ToolRow } from '../../dsh-adapter/channel.js'
import type { Theme } from '../../theme.js'
import type { ClickEvent } from '../../ink/events/click-event.js'
import { SyntaxText } from '../SyntaxText.js'
import { useTooltip } from '../Tooltip.js'
import { foldLongLines } from '../../utils/fold-long-lines.js'
import { formatClock } from '../../trajectory/format.js'
import { primaryComboString } from '../../utils/keymap.js'
import { t } from '../../i18n.js'

export type FoldedTitle = { first: string; hiddenLines: number; hiddenChars: number }

const MAX_ARGS_IN_HEADER = 480

export function clipHeaderArgs(value: string): string {
  return value.length > MAX_ARGS_IN_HEADER ? `${value.slice(0, MAX_ARGS_IN_HEADER)}…` : value
}

export function foldTerminalTitle(value: string, collapseLines: boolean): FoldedTitle | undefined {
  let visible = value
  let hiddenLines = 0
  if (collapseLines) {
    const firstBreak = value.indexOf('\n')
    if (firstBreak >= 0) {
      for (let index = firstBreak; index < value.length; index++) {
        if (value.charCodeAt(index) === 10) hiddenLines++
      }
      if (value.endsWith('\n')) hiddenLines--
      visible = value.slice(0, firstBreak).replace(/\r$/, '')
    }
  }
  const clipped = foldLongLines(visible)
  if (hiddenLines === 0 && clipped.hiddenChars === 0) return undefined
  return { first: clipped.text, hiddenLines, hiddenChars: clipped.hiddenChars }
}

export function toolCardMetaTooltip(tool: ToolRow, running: boolean, failed: boolean): string {
  const details: string[] = []
  if (tool.startedAt !== undefined) {
    if (running) details.push(t('tool-tip-started', { time: formatClock(tool.startedAt) }))
    else if (tool.durationMs !== undefined) {
      details.push(t(failed ? 'tool-tip-failed' : 'tool-tip-finished', {
        time: formatClock(tool.startedAt + tool.durationMs),
      }))
    }
  }
  const result = tool.resultView
  if (result?.card === 'terminal') {
    if (result.exitCode !== undefined && result.exitCode !== 0) {
      details.push(t('tool-tip-exit', { code: result.exitCode }))
    }
    if (result.signal !== undefined) details.push(t('tool-tip-signal', { name: String(result.signal) }))
  }
  return details.join(' · ')
}

type HeaderProps = {
  name: string
  title?: string
  isTerminal: boolean
  folded?: FoldedTitle
  displayArgs: string
  argsLanguage?: 'json'
  nameColor: keyof Theme
  filePath?: string
  onOpenFile?: (path: string) => void
  metaTooltip: () => string
  headerTextBudget: number
}

function splitTitle(value: string): { label: string; detail: string } {
  const separator = value.indexOf(' ')
  return separator < 0
    ? { label: value, detail: '' }
    : { label: value.slice(0, separator), detail: value.slice(separator) }
}

export function HeaderTitle(props: HeaderProps): React.ReactNode {
  const {
    name, title, isTerminal, folded, displayArgs, argsLanguage, nameColor,
    filePath, onOpenFile, metaTooltip, headerTextBudget,
  } = props
  const visibleTitle = title?.trim()
  const hidden = folded !== undefined
    ? title ?? ''
    : title === undefined
      ? (clipHeaderArgs(displayArgs) !== displayArgs ? displayArgs : '')
      : (!isTerminal && stringWidth(visibleTitle ?? '') > headerTextBudget ? visibleTitle ?? '' : '')
  const tooltip = useTooltip(() => {
    if (hidden === '') return ''
    const metadata = metaTooltip()
    return metadata === '' ? hidden : `${hidden}\n${metadata}`
  })
  const nameNode = <Box flexShrink={0}><Text bold color={nameColor} wrap="truncate-end">{name}</Text></Box>

  if (title === undefined) {
    if (displayArgs === '') return nameNode
    return <>{nameNode}<Box flexWrap="nowrap" {...tooltip}>
      <Text>(</Text>
      <SyntaxText text={clipHeaderArgs(displayArgs)} sourceText={displayArgs} language={argsLanguage} />
      <Text>)</Text>
    </Box></>
  }
  if (isTerminal) {
    return <>{nameNode}<Box flexWrap="nowrap" {...tooltip}>
      <Text>({folded?.first ?? title})</Text>
      {folded !== undefined && folded.hiddenLines > 0 && <Text dimColor>{` ${t('lines-folded-expand', {
        n: folded.hiddenLines, key: primaryComboString('transcript'),
      })}`}</Text>}
    </Box></>
  }
  if (visibleTitle === '') return nameNode

  if (filePath && onOpenFile && visibleTitle?.includes(filePath)) {
    const offset = visibleTitle.indexOf(filePath)
    return <Box flexWrap="nowrap" {...tooltip}>
      <Text bold color={nameColor} wrap="truncate-end">{visibleTitle.slice(0, offset)}</Text>
      <Box onClick={(event: ClickEvent) => {
        event.stopImmediatePropagation()
        onOpenFile(filePath)
      }}><Text underline wrap="truncate-end">{filePath}</Text></Box>
      <Text color="text" wrap="truncate-end">{visibleTitle.slice(offset + filePath.length)}</Text>
    </Box>
  }
  const { label, detail } = splitTitle(visibleTitle ?? '')
  return <Box flexWrap="nowrap" {...tooltip}>
    <Text bold color={nameColor} wrap="truncate-end">{label}<Text bold={false} color="text">{detail}</Text></Text>
  </Box>
}
