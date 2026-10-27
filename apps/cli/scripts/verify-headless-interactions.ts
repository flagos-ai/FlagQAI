import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'

import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ApprovalRequest } from '@deepseek-ai/dsh-user-approval'
import type { AskUserQuestionRequest } from '@deepseek-ai/dsh-user-questions'
import { ApprovalStore } from '../src/dsh-adapter/approvals.js'
import { QuestionStore, isQuestionInterruption } from '../src/channel/questions.js'
// The binding loads the platform bundle relative to its compiled distribution.
// Run compile:src before this regression, as verify:build does.
import { createHeadlessInteractionRouter } from '../lib/types/dsh-adapter/headless-interactions.js'

const agent = {
  id: 'agent-1',
  session: {
    events: [{
      type: 'tool/call',
      data: { callId: 'call-1', arguments: JSON.stringify({ command: 'npm test' }) },
    }],
  },
} as unknown as Agent

const approvals = new ApprovalStore()
const approval = approvals.park({
  agent,
  callId: 'call-1',
  toolName: 'shell',
  reason: 'Run the repository tests',
} as unknown as ApprovalRequest)
const approvalView = approvals.pendingViews()[0]
assert.equal(approvalView?.toolName, 'shell')
assert.equal(approvalView?.command, 'npm test')
assert.equal(approvalView?.agentId, 'agent-1')
assert.equal(approvalView?.options.length, 2)
approvals.respond(approvalView!.requestId, { kind: 'allow-once' })
assert.equal(await approval, 'allowed-once')
assert.throws(() => approvals.respond(approvalView!.requestId, { kind: 'reject' }), /not pending/)

const unsupported = approvals.park({
  agent,
  callId: 'call-2',
  toolName: 'shell',
} as unknown as ApprovalRequest)
const unsupportedId = approvals.pendingViews()[0]!.requestId
assert.throws(() => approvals.respond(unsupportedId, { kind: 'allow-always' }), /do not support/)
approvals.respond(unsupportedId, { kind: 'reject', message: 'No' })
assert.equal(await unsupported, 'rejected')

const questions = new QuestionStore()
const question = questions.ask({
  agent,
  questions: [{
    id: 'target',
    question: 'Choose a target',
    options: [{ label: 'CPU' }, { label: 'GPU' }],
  }],
} as unknown as AskUserQuestionRequest)
const questionView = questions.pendingViews()[0]
assert.equal(questionView?.agentId, 'agent-1')
assert.equal(questionView?.questions[0]?.question, 'Choose a target')
assert.throws(
  () => questions.respond(questionView!.requestId, { answers: [{ selected: ['TPU'] }] }),
  /unknown or duplicate option/,
)
questions.respond(questionView!.requestId, { answers: [{ selected: ['GPU'] }] })
assert.deepEqual(await question, { answers: [{ id: 'target', selected: ['GPU'] }] })

const cancelled = questions.ask({
  agent,
  questions: [{ id: 'reason', question: 'Why?', options: [] }],
} as unknown as AskUserQuestionRequest)
questions.cancelRequest(questions.pendingViews()[0]!.requestId)
await assert.rejects(cancelled, error => isQuestionInterruption(error))

// Exercise the native event bindings, not just the stores in isolation.
for (const legacy of [false, true]) {
  const handlers = new Map<string, (request: unknown, next: () => unknown) => unknown>()
  const effects: (() => void)[] = []
  let legacyAsk: ((request: AskUserQuestionRequest) => Promise<unknown>) | undefined
  let detached = 0
  const userQuestions = legacy ? {
    registerProvider(provider: { ask(request: AskUserQuestionRequest): Promise<unknown> }) {
      legacyAsk = provider.ask
      return () => { legacyAsk = undefined; detached++ }
    },
  } : {}
  const ctx = {
    get: (name: string) => name === 'userQuestions' ? userQuestions : name === 'approval' ? {} : undefined,
    plugin() {},
    on(name: string, handler: (request: unknown, next: () => unknown) => unknown) {
      handlers.set(name, handler)
      return () => { if (handlers.delete(name)) detached++ }
    },
    effect(register: () => () => void) { effects.push(register()) },
    logger: { error(error: unknown) { throw error } },
  } as unknown as Context
  const router = await createHeadlessInteractionRouter(ctx)
  const one = router.bind(agent)
  const otherAgent = { ...agent, id: 'agent-2' } as unknown as Agent
  const two = router.bind(otherAgent)
  const events: string[] = []
  one.subscribe(batch => events.push(...batch.map(event => event.type)))
  const ask = (request: AskUserQuestionRequest) => legacy
    ? legacyAsk!(request)
    : handlers.get('user-questions/request')!(request, () => 'next')
  const request = { agent, questions: [{ id: 'target', question: 'Choose', options: [{ label: 'CPU' }] }] } as unknown as AskUserQuestionRequest
  const asked = ask(request)
  assert.equal(one.requiresAction(), true)
  assert.equal(two.requiresAction(), false)
  const questionEvent = [] as { requestId: string }[]
  // Start a second native question: both are queued by the authoritative store.
  const subscribed = two.subscribe(batch => {
    for (const event of batch) if (event.type === 'question.request') questionEvent.push(event.request)
  })
  const otherAsked = ask({ ...request, agent: otherAgent })
  assert.equal(questionEvent.length, 1)
  two.questions.respond(questionEvent[0].requestId, { answers: [{ selected: ['CPU'] }] })
  assert.deepEqual(await otherAsked, { answers: [{ id: 'target', selected: ['CPU'] }] })
  subscribed()
  const controller = new AbortController()
  const aborted = assert.rejects(ask({ ...request, agent: otherAgent, signal: controller.signal }) as Promise<unknown>, isQuestionInterruption)
  controller.abort()
  await aborted
  assert.equal(two.requiresAction(), false)

  const approval = handlers.get('approval/request')!({ agent, callId: 'call-1', toolName: 'shell' }, () => 'next')
  const approvalId = one.permissions.pending()[0].requestId
  assert.throws(() => one.permissions.respond(approvalId, { kind: 'allow-always' }), /do not support/)
  one.permissions.respond(approvalId, { kind: 'allow-once' })
  assert.equal(await approval, 'allowed-once')
  assert.equal(handlers.get('approval/request')!({ agent: { id: 'unknown' } }, () => 'next'), 'next')
  const unknownQuestion = { ...request, agent: { id: 'unknown' } } as unknown as AskUserQuestionRequest
  if (legacy) await assert.rejects(ask(unknownQuestion) as Promise<unknown>, /does not belong/)
  else assert.equal(ask(unknownQuestion), 'next')

  const cancelled = assert.rejects(asked as Promise<unknown>, isQuestionInterruption)
  router.dispose()
  await cancelled
  assert.deepEqual(events, ['question.request', 'permission.request', 'permission.settled', 'question.settled'])
  for (const dispose of effects) dispose()
  assert.equal(handlers.has('user-questions/request'), false)
  assert.equal(handlers.has('approval/request'), false)
  assert.equal(legacyAsk, undefined)
  assert.equal(detached, 2)
  assert.throws(() => router.bind(agent), /disposed/)
}

console.log('PASS native headless stores and shared router: modern/legacy questions, agent isolation, approvals, cancellation and disposal')
