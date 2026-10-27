import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useTerminalSize } from '../ui.js'
import { getLang, subscribeLang, tOr } from '../i18n.js'
import { SPINNER_VERBS } from '../terminal-utils/spinnerVerbs.js'
import { SpinnerAnimationRow } from './Spinner/SpinnerAnimationRow.js'
import type { SpinnerMode } from './Spinner/spinnerMode.js'

type Props = {
  mode: SpinnerMode
  hasActiveTools: boolean
  responseLengthRef: React.RefObject<number>
  uploadTokensRef: React.RefObject<number>
  loadingStartTimeRef: React.RefObject<number>
  totalPausedMsRef: React.RefObject<number>
  pauseStartTimeRef: React.RefObject<number | null>
  thinkingStatus: 'thinking' | number | null
  suffix?: string
}

/** Choose one verb for each activity phase so animated frames do not change copy. */
function chooseVerb(): string {
  return SPINNER_VERBS[Math.floor(Math.random() * SPINNER_VERBS.length)] ?? 'Working'
}

/** The compact in-flight block between transcript and prompt. */
export function WorkingSpinner({
  mode, hasActiveTools, responseLengthRef, uploadTokensRef, loadingStartTimeRef,
  totalPausedMsRef, pauseStartTimeRef, thinkingStatus, suffix,
}: Props): React.ReactNode {
  const { columns } = useTerminalSize()
  useSyncExternalStore(subscribeLang, getLang)
  const verb = useMemo(chooseVerb, [mode])
  // Long randomized verbs can consume the cells reserved for a phase suffix
  // and elapsed time. Use the short localized label on compact terminals.
  const visibleVerb = columns < 36 ? 'Working' : verb
  const message = `${tOr(`spinner-verb-${visibleVerb.toLowerCase()}`, visibleVerb)}…`

  return <SpinnerAnimationRow
    mode={mode}
    reducedMotion={false}
    hasActiveTools={hasActiveTools}
    responseLengthRef={responseLengthRef}
    uploadTokensRef={uploadTokensRef}
    message={message}
    messageColor="text"
    shimmerColor="accentShimmer"
    loadingStartTimeRef={loadingStartTimeRef}
    totalPausedMsRef={totalPausedMsRef}
    pauseStartTimeRef={pauseStartTimeRef}
    spinnerSuffix={suffix}
    verbose
    columns={columns}
    thinkingStatus={thinkingStatus}
  />
}

type ThoughtState = {
  startedAt: number | null
  duration: number | null
  expiresAt: number
}

/** Keep a completed thinking duration visible for two seconds after the phase ends. */
export function useThinkingStatus(isThinking: boolean): 'thinking' | number | null {
  const phase = useRef<ThoughtState>({ startedAt: null, duration: null, expiresAt: 0 })
  const [, refresh] = useState(0)
  const now = Date.now()

  if (isThinking) {
    if (phase.current.startedAt === null) phase.current.startedAt = now
    phase.current.duration = null
    phase.current.expiresAt = 0
  } else if (phase.current.startedAt !== null) {
    phase.current.duration = Math.max(0, now - phase.current.startedAt)
    phase.current.startedAt = null
    phase.current.expiresAt = now + 2000
  } else if (phase.current.duration !== null && now >= phase.current.expiresAt) {
    phase.current.duration = null
  }

  const expiresAt = phase.current.expiresAt
  useEffect(() => {
    if (isThinking || expiresAt === 0) return
    const delay = Math.max(0, expiresAt - Date.now())
    const timer = setTimeout(() => refresh(value => value + 1), delay + 1)
    return () => clearTimeout(timer)
  }, [isThinking, expiresAt])

  return isThinking ? 'thinking' : phase.current.duration
}
