import { t } from '../i18n.js'

export interface QuestionRecordQuestion {
  readonly question: string
  readonly secret?: boolean
}

export interface QuestionRecordAnswer {
  readonly selected: readonly string[]
  readonly custom?: string
}

export interface QuestionRecord {
  readonly title: string
  readonly lines: readonly string[]
}

export const SECRET_ANSWER = '••••'
const REDACTED_ANSWER = '••••••'
const MAX_VISIBLE_GRAPHEMES = 140
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

function displayLine(value: string): string {
  const clean = value.replace(/[\u0000-\u001f\u007f-\u009f]/gu, ' ').trim()
  const parts = [...segmenter.segment(clean)].map(part => part.segment)
  return parts.length > MAX_VISIBLE_GRAPHEMES
    ? parts.slice(0, MAX_VISIBLE_GRAPHEMES).join('') + '…'
    : clean
}

function recordObject(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function parsePayload(raw: string | undefined, field: 'questions' | 'answers'): unknown[] | undefined {
  if (typeof raw !== 'string') return undefined
  try {
    const payload = recordObject(JSON.parse(raw))
    return Array.isArray(payload?.[field]) ? payload[field] as unknown[] : undefined
  } catch {
    return undefined
  }
}

/** Turn persisted ask arguments into index-aligned, display-safe questions. */
export function parseQuestionRecordQuestions(rawArguments: string | undefined): QuestionRecordQuestion[] | undefined {
  const items = parsePayload(rawArguments, 'questions')
  if (!items) return undefined
  return items.map(item => {
    const question = recordObject(item)
    return {
      question: typeof question?.question === 'string' ? question.question : '',
      ...(question?.secret === true ? { secret: true } : {}),
    }
  })
}

/** Turn the tool's JSON result into index-aligned answer fields. */
export function parseQuestionRecordAnswers(rawResult: string): QuestionRecordAnswer[] | undefined {
  const items = parsePayload(rawResult, 'answers')
  if (!items) return undefined
  return items.map(item => {
    const answer = recordObject(item)
    return {
      selected: Array.isArray(answer?.selected)
        ? answer.selected.filter((part): part is string => typeof part === 'string')
        : [],
      ...(typeof answer?.custom === 'string' ? { custom: answer.custom } : {}),
    }
  })
}

/**
 * A transcript summary is derived from durable question and answer pairs.
 * Malformed or unanswered pairs contribute no line; a secret never contributes
 * its selected labels or custom text.
 */
export function buildQuestionRecord(
  questions: readonly (QuestionRecordQuestion | undefined)[] | undefined,
  answers: readonly (QuestionRecordAnswer | undefined)[] | undefined,
  options?: { redact?: boolean },
): QuestionRecord {
  const list = Array.isArray(questions) ? questions : []
  const replies = Array.isArray(answers) ? answers : []
  const lines: string[] = []
  for (let index = 0; index < list.length; index++) {
    const question = recordObject(list[index])
    const answer = recordObject(replies[index])
    if (typeof question?.question !== 'string' || !question.question.trim() || !answer) continue
    const chosen = Array.isArray(answer.selected)
      ? answer.selected.filter((part): part is string => typeof part === 'string')
      : []
    const custom = typeof answer.custom === 'string' ? answer.custom : ''
    if (!chosen.length && !custom.trim()) continue
    const response = options?.redact
      ? REDACTED_ANSWER
      : question.secret === true
        ? SECRET_ANSWER
        : displayLine([...chosen, custom].filter(Boolean).join(', '))
    lines.push(`· ${displayLine(question.question)} → ${response}`)
  }
  return { title: t('questionnaire-answered', { total: list.length }), lines }
}
