import React from 'react'
import { Box, Text, useAnimationFrame } from '../../ui.js'
import { formatDuration, formatTokens } from '../../terminal-utils/format.js'
import type { Theme } from '../../theme.js'
import type { SpinnerMode } from './spinnerMode.js'
import { SpinnerGlyph } from './SpinnerGlyph.js'
import { GlimmerMessage } from './GlimmerMessage.js'
import { useStalledAnimation } from './useStalledAnimation.js'

export type SpinnerAnimationRowProps = {
  mode: SpinnerMode
  reducedMotion: boolean
  hasActiveTools: boolean
  responseLengthRef: React.RefObject<number>
  uploadTokensRef: React.RefObject<number>
  message: string
  messageColor: keyof Theme
  shimmerColor: keyof Theme
  loadingStartTimeRef: React.RefObject<number>
  totalPausedMsRef: React.RefObject<number>
  pauseStartTimeRef: React.RefObject<number | null>
  spinnerSuffix?: string | null
  verbose: boolean
  columns: number
  thinkingStatus: 'thinking' | number | null
}

/** Visible counters are a view of the channel's refs, never an alternate session state. */
export function workingSpinnerDetails(input: {
  now: number
  startedAt: number
  pausedMs: number
  pauseStartedAt: number | null
  uploadTokens: number
  responseChars: number
  mode: SpinnerMode
  thinkingStatus: 'thinking' | number | null
  suffix?: string | null
  columns: number
}): string {
  const elapsed = Math.max(0, input.now - input.startedAt - input.pausedMs -
    (input.pauseStartedAt === null ? 0 : Math.max(0, input.now - input.pauseStartedAt)))
  const fields = [input.suffix?.trim(), formatDuration(elapsed)].filter(Boolean) as string[]
  if (input.columns >= 48) {
    const direction = input.mode === 'requesting' ? '↑' : '↓'
    const upload = Math.max(0, Math.floor(input.uploadTokens))
    const download = Math.max(0, Math.round(input.responseChars / 4))
    fields.push(`${direction} ↑ ${formatTokens(upload)} · ↓ ${formatTokens(download)} tokens`)
    if (input.thinkingStatus === 'thinking') fields.push('thinking')
    else if (typeof input.thinkingStatus === 'number') {
      fields.push(`thought for ${formatDuration(Math.max(0, Math.round(input.thinkingStatus / 1000) * 1000))}`)
    }
  }
  return fields.join(' · ')
}

/** The changing part of the in-flight status row; layout stays one line high. */
export function SpinnerAnimationRow({
  mode, reducedMotion, hasActiveTools, responseLengthRef, uploadTokensRef,
  message, messageColor, shimmerColor, loadingStartTimeRef, totalPausedMsRef,
  pauseStartTimeRef, spinnerSuffix, verbose, columns, thinkingStatus,
}: SpinnerAnimationRowProps): React.ReactNode {
  const [animationRef, time] = useAnimationFrame(reducedMotion ? 1000 : 50)
  const { stalledIntensity } = useStalledAnimation(time, responseLengthRef.current, hasActiveTools, reducedMotion)
  const frame = Math.floor(time / 160)
  const details = verbose ? workingSpinnerDetails({
    now: Date.now(),
    startedAt: loadingStartTimeRef.current,
    pausedMs: totalPausedMsRef.current,
    pauseStartedAt: pauseStartTimeRef.current,
    uploadTokens: uploadTokensRef.current,
    responseChars: responseLengthRef.current,
    mode,
    thinkingStatus,
    suffix: spinnerSuffix,
    columns,
  }) : ''
  const glimmerIndex = reducedMotion ? -10 : Math.floor(time / 90) % Math.max(1, Array.from(message).length + 5)
  const flashOpacity = reducedMotion ? 0 : Math.max(0, Math.sin(time / 240)) * 0.12

  return <Box ref={animationRef} flexDirection="column">
    <Box height={1} />
    <Box flexDirection="row" height={1} overflow="hidden">
      <SpinnerGlyph frame={frame} reducedMotion={reducedMotion} messageColor={messageColor}
        stalledIntensity={stalledIntensity} time={time} />
      <Box flexShrink={0} flexDirection="row">
        <GlimmerMessage message={message} mode={mode} messageColor={messageColor}
          glimmerIndex={glimmerIndex} flashOpacity={flashOpacity} shimmerColor={shimmerColor}
          stalledIntensity={stalledIntensity} />
      </Box>
      {details && <Text color="subtle" wrap="truncate-end">({details})</Text>}
    </Box>
  </Box>
}
