import React, { useContext } from 'react'
import { Box, Text, useAnimationFrame } from '../../ui.js'
import type { ClickEvent } from '../../ink/events/click-event.js'
import { TerminalSizeContext } from '../../ink/components/TerminalSizeContext.js'
import wrapText from '../../ink/wrap-text.js'
import { formatDuration, formatTokens } from '../../terminal-utils/format.js'
import { primaryComboString } from '../../utils/keymap.js'
import { t } from '../../i18n.js'
import { Markdown } from '../Markdown.js'

type Props = {
  thinking: string
  textFull?: string
  marginTopOnTurn: boolean
  verbose: boolean
  streaming?: boolean
  preview?: boolean
  durationMs?: number
  reasoningTokens?: number
  isSelected?: boolean
  onClick?(event: ClickEvent): void
}

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const
const PREVIEW_ROWS = 3

function latestLines(text: string, width: number): string[] {
  const lines = text.split('\n')
  const shown = lines.slice(-PREVIEW_ROWS).map(line => wrapText(line, width, 'truncate'))
  while (shown.length < PREVIEW_ROWS) shown.unshift(' ')
  return shown
}

/** Transcript reasoning row; the Agent backend still owns the reasoning content. */
export function AssistantThinkingMessage({
  thinking, textFull, marginTopOnTurn, verbose, streaming = false,
  preview = false, durationMs, reasoningTokens, isSelected = false, onClick,
}: Props): React.ReactNode {
  const size = useContext(TerminalSizeContext)
  const [animationRef, time] = useAnimationFrame(streaming ? 90 : null)
  // A freshly arrived reasoning block can be ahead of the reveal cursor.
  // Its compact preview follows the arrived text even before the body opens.
  const visibleText = thinking.length > 0 || (preview && (textFull?.length ?? 0) > 0)
  const countOnly = !visibleText && Number.isFinite(reasoningTokens) && (reasoningTokens ?? 0) > 0
  if (!visibleText && !countOnly) return null

  const marker = streaming ? FRAMES[Math.floor(time / 90) % FRAMES.length] : '⚓'
  const label = countOnly
    ? t(streaming ? 'thinking-tokens-live' : 'thinking-tokens-done', { n: formatTokens(reasoningTokens!) })
    : t('thinking-label')
  const duration = durationMs !== undefined && Number.isFinite(durationMs)
    ? ` · ${formatDuration(durationMs)}` : ''
  const folded = visibleText && !verbose && !preview && !streaming
  const hint = folded ? ` ${t('hint-expand-ctrl-o', { key: primaryComboString('transcript') })}` : ''
  const showPreview = visibleText && preview && !verbose
  const showBody = visibleText && !showPreview && (verbose || streaming)
  const previewWidth = Math.max(1, (size?.columns ?? 80) - 4)

  return (
    <Box
      ref={animationRef}
      width="100%"
      flexDirection="column"
      marginTop={marginTopOnTurn ? 1 : 0}
      backgroundColor={isSelected ? 'messageActionsBackground' : undefined}
      onClick={onClick}
    >
      <Box flexDirection="row" width="100%">
        <Box width={2}><Text color="subtle">{marker}</Text></Box>
        <Text color="subtle">{label + duration + hint}</Text>
      </Box>
      {showPreview && (
        <Box flexDirection="column" height={PREVIEW_ROWS} paddingLeft={2}>
          {latestLines(textFull ?? thinking, previewWidth).map((line, index) =>
            <Text key={index} color="subtle" wrap="truncate">{line}</Text>)}
        </Box>
      )}
      {showBody && <Box paddingLeft={2} flexDirection="column"><Markdown dimColor>{thinking}</Markdown></Box>}
    </Box>
  )
}
