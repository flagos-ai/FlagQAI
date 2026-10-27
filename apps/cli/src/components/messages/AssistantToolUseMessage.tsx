import React from 'react'
import { Box, Text, useTerminalSize } from '../../ui.js'
import type { ToolRow, ToolCallView, ToolResultView } from '../../dsh-adapter/channel.js'
import type { ClickEvent } from '../../ink/events/click-event.js'
import type { ToolBackground } from '../../tuiDisplayPrefs.js'
import type { Theme } from '../../theme.js'
import { t } from '../../i18n.js'
import { formatDuration } from '../../terminal-utils/format.js'
import { useAnimationFrame } from '../../ink/hooks/use-animation-frame.js'
import { SplitDiffView } from '../SplitDiffView.js'
import { revealLinesOf } from '../smoothReveal.js'
import { liveOutputMaxLines, liveOutputView } from './liveOutputLines.js'
import { HeaderTitle, foldTerminalTitle, toolCardMetaTooltip } from './toolCardHeader.js'
import { capLines, dim, foldBodyLines, plain, toolNameColor, viewLines,
  TEXT_BODY_MAX_LINES, DIFF_BODY_MAX_LINES, SPLIT_DIFF_MIN_COLS,
  VERBOSE_BODY_WINDOW, GUTTER_FIRST, GUTTER_REST, type BodyLine } from './toolCardBody.js'

export { toolNameColor } from './toolCardBody.js'

type Props = {
  tool: ToolRow
  marginTopOnTurn: boolean
  verbose: boolean
  isSelected?: boolean
  isExpanded?: boolean
  footnote?: string
  diffLayout?: 'auto' | 'unified' | 'split'
  toolBackground?: ToolBackground
  smoothReveal?: boolean
  fresh?: boolean
  revealVersion?: number
  foldTerminalCommand?: boolean
  onClick?: (event: ClickEvent) => void
  onOpenFile?: (path: string) => void
  sourceFolded?: boolean
  fullscreen?: boolean
}

const NAMES: Record<string, string> = {
  bash: 'tool-name-bash', powershell: 'tool-name-powershell', read: 'tool-name-read',
  glob: 'tool-name-glob', grep: 'tool-name-grep', write: 'tool-name-write',
  edit: 'tool-name-edit', todo_write: 'tool-name-todo_write', subagent: 'tool-name-subagent',
  web_search: 'tool-name-web_search', multiedit: 'tool-name-multiedit',
  notebookedit: 'tool-name-notebookedit', webfetch: 'tool-name-webfetch', skill: 'tool-name-skill',
}

function label(name: string, key?: string): string {
  const lookup = key ?? NAMES[name.toLowerCase()]
  return lookup ? t(lookup as Parameters<typeof t>[0]) : name.slice(0, 1).toUpperCase() + name.slice(1)
}

function textRows(text?: string): BodyLine[] {
  return text ? text.trimEnd().split('\n').map(plain) : []
}

function jsonRecord(raw: string | undefined): Record<string, unknown> | undefined {
  if (!raw) return undefined
  try {
    const value: unknown = JSON.parse(raw)
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown> : undefined
  } catch { return undefined }
}

function word(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function sendMessageView(tool: ToolRow): { target: string; text: string; summary?: string; resuming: boolean } | undefined {
  if (tool.name.toLowerCase() !== 'sendmessage') return undefined
  const args = jsonRecord(tool.argsFull ?? tool.argsText)
  if (!args) return undefined
  const pin = args.pin && typeof args.pin === 'object' ? args.pin as Record<string, unknown> : undefined
  return { target: word(pin?.name) ?? word(args.to) ?? '?',
    text: word(args.message) ?? '', summary: word(args.summary), resuming: args.resuming === true }
}

function sendState(tool: ToolRow): string {
  if (tool.status === 'running') return 'issued'
  if (tool.status === 'error') return 'refused'
  const delivery = word(jsonRecord(tool.resultFull ?? tool.resultText)?.delivery)
  return delivery && ['issued', 'queued', 'delivered', 'held', 'refused', 'expired'].includes(delivery)
    ? delivery : 'unknown'
}

function filePathOf(view: ToolCallView | ToolResultView | undefined): string | undefined {
  if (view?.card === 'read') return view.path
  if (view?.card === 'diff') return view.diffs[0]?.path
  return undefined
}

function rowColor(tone: BodyLine['tone']): keyof Theme | undefined {
  if (tone === 'add') return 'diffAdded'
  if (tone === 'del') return 'diffRemoved'
  if (tone === 'error') return 'error'
  if (tone === 'path') return 'accent'
  return undefined
}

function visibleBody(tool: ToolRow, view: ToolCallView | ToolResultView | undefined,
  expanded: boolean, sourceFolded: boolean): BodyLine[] {
  if (tool.status === 'error' && tool.errorText) return textRows(tool.errorText).map(line => ({ ...line, tone: 'error' }))
  if (expanded && !sourceFolded && tool.resultFull !== undefined) return textRows(tool.resultFull)
  if (view) {
    const lines = viewLines(view)
    if (lines.length > 0) return lines
  }
  return textRows(expanded && !sourceFolded ? tool.resultFull ?? tool.resultText : tool.resultText ?? tool.resultFull)
}

function BodyRows({ rows, onOpenFile, diff, expanded }: { rows: readonly BodyLine[]; onOpenFile?: (path: string) => void; diff: boolean; expanded: boolean }): React.ReactNode {
  return <Box flexDirection="column">{rows.map((row, index) =>
    <Box key={index} flexDirection="row" flexWrap="nowrap">
      <Text color="subtle">{index === 0 ? GUTTER_FIRST : GUTTER_REST}</Text>
      {row.target && onOpenFile
        ? <Box onClick={(event: ClickEvent) => { event.stopImmediatePropagation(); onOpenFile(row.target!) }}>
          <Text underline color={rowColor(row.tone)} wrap="truncate-end">{row.text}</Text>
        </Box>
        : <Text color={rowColor(row.tone)} dimColor={row.tone === 'dim' || row.tone === 'live'}
          wrap={row.tone === 'live' || (diff && row.text.length >= 120) ? 'truncate-end' : 'wrap'}>{row.text}</Text>}
      {row.suffix && <Text dimColor wrap="truncate-end">{row.suffix}</Text>}
    </Box>)}</Box>
}

/** Presentation of one Harness-owned tool call in the terminal transcript. */
export function AssistantToolUseMessage({
  tool, marginTopOnTurn, verbose, isSelected = false, isExpanded = false,
  footnote, diffLayout = 'auto', toolBackground = 'none', smoothReveal = false,
  fresh = false, foldTerminalCommand = false, onClick, onOpenFile,
  sourceFolded = false, fullscreen = false,
}: Props): React.ReactNode {
  const { columns } = useTerminalSize()
  const running = tool.status === 'running'
  const failed = tool.status === 'error'
  const revealEligible = smoothReveal && fresh && running && !verbose && !isExpanded && !tool.liveOutput
  const [animationRef] = useAnimationFrame(revealEligible ? 30 : running ? 250 : null)
  const view = running ? tool.callView : tool.resultView ?? tool.callView
  const expanded = verbose || isExpanded
  const message = sendMessageView(tool)
  const name = label(tool.name, view?.displayKey ?? tool.callView?.displayKey)
  const resultTitle = (view && 'title' in view ? view.title : undefined) ??
    (tool.callView && 'title' in tool.callView ? tool.callView.title : undefined)
  const title = message
    ? `${name} → ${message.target}${message.resuming ? ` · ${t('send-message-card-resuming')}` : ''}`
    : resultTitle
  const terminal = view?.card === 'terminal'
  const folded = terminal && !expanded && title
    ? foldTerminalTitle(title, foldTerminalCommand) : undefined
  const split = view?.card === 'diff' && view.diffs.length > 0 &&
    (diffLayout === 'split' || (diffLayout === 'auto' && columns >= SPLIT_DIFF_MIN_COLS))
  const backgroundColor = isSelected ? 'messageActionsBackground'
    : toolBackground === 'strong' ? 'toolCardBackground'
      : toolBackground === 'subtle' ? 'toolCardBackgroundDim' : undefined

  let rows: BodyLine[]
  if (message) {
    rows = message.text.split('\n').map(plain)
    if (message.summary) rows.push(dim(`${t('send-message-card-summary-label')}: ${message.summary}`))
    if (failed && tool.errorText) rows.push({ text: tool.errorText, tone: 'error' })
    if (expanded) {
      rows.push(dim(t('send-message-card-args')))
      rows.push(...textRows(tool.argsFull ?? tool.argsText))
      if (tool.resultFull ?? tool.resultText) {
        rows.push(dim(t('send-message-card-result')))
        rows.push(...textRows(tool.resultFull ?? tool.resultText))
      }
    }
  } else if (running) {
    rows = [dim(t('tool-running-elapsed', { duration: formatDuration(Math.max(0, Date.now() - tool.startedAt)) }))]
    if (view?.card === 'diff') rows.push(...viewLines(view))
    if (tool.liveOutput) {
      const live = liveOutputView(tool.liveOutput, tool.liveOutputDropped ?? 0,
        liveOutputMaxLines(expanded, fullscreen), Math.max(1, columns - 5))
      if (live.omitted > 0) rows.push(dim(t('tool-live-omitted', { count: live.omitted })))
      rows.push(...live.lines.map(line => ({ text: line, tone: 'live' } as BodyLine)))
    }
  } else {
    rows = visibleBody(tool, view, expanded, sourceFolded)
  }

  if (!expanded && (!running || view?.card === 'diff')) {
    const foldedBody = foldBodyLines(rows)
    rows = capLines(foldedBody.lines, view?.card === 'diff' ? DIFF_BODY_MAX_LINES : TEXT_BODY_MAX_LINES,
      false, foldedBody.hiddenChars)
  } else if (expanded && !message && rows.length > VERBOSE_BODY_WINDOW) {
    const total = rows.length
    rows = [...rows.slice(0, VERBOSE_BODY_WINDOW), dim(t('tool-card-window-shown', {
      shown: VERBOSE_BODY_WINDOW, total,
    }))]
  }

  if (expanded && !message && !running) {
    if (sourceFolded) rows.push(dim(t('tool-card-source-truncated')))
    else if (tool.resultFull === undefined && view !== undefined) rows.push(dim(t('tool-card-full-unavailable')))
  }

  const code = view?.card === 'terminal' && 'exitCode' in view ? view.exitCode : undefined
  const signal = view?.card === 'terminal' && 'signal' in view ? view.signal : undefined
  if (!running && code !== undefined && code !== 0) rows.push({ text: t('tool-exit-code', { code }), tone: 'error' })
  if (!running && signal) rows.push({ text: t('tool-killed-signal', { name: signal }), tone: 'error' })

  const revealed = revealEligible
    ? revealLinesOf(`tool:${tool.callId}`, rows.length, { enabled: true, active: true }) : rows.length
  const paintedRows = revealEligible ? rows.slice(0, revealed) : rows
  const sendDelivery = message ? sendState(tool) : undefined
  const resumed = message ? word(jsonRecord(tool.resultFull ?? tool.resultText)?.resumedAgentId) : undefined
  const duration = !running && tool.durationMs !== undefined ? ` · ${formatDuration(tool.durationMs)}` : ''

  return <Box ref={animationRef} width="100%" flexDirection="column"
    marginTop={marginTopOnTurn ? 1 : 0} backgroundColor={backgroundColor} onClick={onClick}>
    <Box flexDirection="row" flexWrap="nowrap" width="100%">
      <Text color={failed ? 'error' : running ? 'warning' : 'success'}>{failed ? '✗' : running ? '●' : '•'}</Text>
      <Text> </Text>
      {message
        ? <Text color={toolNameColor(tool.name)} bold wrap="truncate-end">{title}</Text>
        : <HeaderTitle name={name} title={title} isTerminal={terminal} folded={folded}
          displayArgs={tool.argsText} argsLanguage="json"
          nameColor={toolNameColor(tool.name, view?.category ?? tool.callView?.category)}
          filePath={filePathOf(view)} onOpenFile={onOpenFile}
          metaTooltip={() => toolCardMetaTooltip(tool, running, failed)}
          headerTextBudget={Math.max(10, columns - 22)} />}
      {duration && <Text dimColor>{duration}</Text>}
    </Box>
    {split && view?.card === 'diff'
      ? <SplitDiffView diffs={view.diffs} width={Math.max(20, columns - 4)}
        maxRows={DIFF_BODY_MAX_LINES} verbose={expanded} toolBackground={toolBackground} />
      : <BodyRows rows={paintedRows} onOpenFile={onOpenFile} diff={view?.card === 'diff'} expanded={expanded} />}
    {sendDelivery && <Box paddingLeft={3} flexDirection="column">
      <Text color={sendDelivery === 'delivered' ? 'success' : sendDelivery === 'refused' ? 'error' : 'subtle'}>
        {sendDelivery}{resumed ? ` · ${t('send-message-card-resumed', { id: resumed.slice(0, 7) })}` : ''}
      </Text>
      {sendDelivery === 'unknown' && <Text dimColor>{t('agent-message-no-delivery-fact')}</Text>}
    </Box>}
    {footnote && <Box paddingLeft={3}><Text dimColor>{footnote}</Text></Box>}
  </Box>
}
