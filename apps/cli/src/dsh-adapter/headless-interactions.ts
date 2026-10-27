/** Harness interaction answerers used by the headless FlagQAI service. */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import UserQuestionService, {
  type AskUserQuestionAnswer,
  type AskUserQuestionRequest,
} from '@deepseek-ai/dsh-user-questions'
import type { ApprovalRequest } from '@deepseek-ai/dsh-user-approval'
import * as toolAskUser from '@deepseek-ai/dsh-tool-ask-user'
import type { PermissionDecision, QuestionAnswers } from '../agent/capabilities.js'
import type { AgentEvent, AgentEventMeta } from '../agent/events.js'
import { adapterRuntimeFor } from '../adapter/kernel/runtime-context.js'
import { ApprovalStore } from './approvals.js'
import { QuestionStore } from './questions.js'
import type { createInteractionRouter as SharedRouterFactory } from '../../../../packages/harness-adapter/interactions.mjs'

type EventListener = (batch: readonly AgentEvent[], meta: AgentEventMeta) => void

export interface HeadlessSessionInteractions {
  readonly permissions: {
    respond(requestId: string, decision: PermissionDecision): void
    pending(): ReturnType<ApprovalStore['pendingViews']>
  }
  readonly questions: {
    respond(requestId: string, answers: QuestionAnswers): void
    cancel(requestId: string): void
  }
  requiresAction(): boolean
  subscribe(listener: EventListener): () => void
  dispose(): void
}

interface LegacyQuestionService {
  registerProvider(provider: { ask(request: AskUserQuestionRequest): Promise<AskUserQuestionAnswer> }): () => void
}

const hasLegacyProvider = (value: unknown): value is LegacyQuestionService =>
  typeof (value as { registerProvider?: unknown })?.registerProvider === 'function'

/** Bind Harness protocols to the shared router without owning its session maps. */
export async function createHeadlessInteractionRouter(ctx: Context): Promise<{
  bind(agent: Agent): HeadlessSessionInteractions
  dispose(): void
}> {
  const modulePath = '../../flagqai-platform/harness-adapter/interactions.mjs'
  const { createInteractionRouter } = await import(modulePath) as { createInteractionRouter: typeof SharedRouterFactory }
  const router = createInteractionRouter({
    createStores: () => ({
      approvals: new ApprovalStore(adapterRuntimeFor(ctx)),
      questions: new QuestionStore(adapterRuntimeFor(ctx)),
    }),
  })
  const askQuestion = (request: AskUserQuestionRequest) => request.agent?.id === undefined
    ? undefined
    : router.askQuestion(String(request.agent.id), request)
  try {
    const userQuestions = ctx.get('userQuestions') ?? new UserQuestionService(ctx)
    ctx.plugin(toolAskUser)
    if (hasLegacyProvider(userQuestions)) {
      router.addDisposer(userQuestions.registerProvider({
        ask(request) {
          return askQuestion(request)
            ?? Promise.reject(new Error('question does not belong to an attached FlagQAI session'))
        },
      }))
    } else {
      router.addDisposer(ctx.on('user-questions/request', (request, next) =>
        askQuestion(request) ?? next()))
    }
    if (ctx.get('approval') !== undefined) {
      router.addDisposer(ctx.on('approval/request', (request: ApprovalRequest, next) =>
        router.parkApproval(String(request.agent.id), request) ?? next()))
    }
    ctx.effect(() => () => router.dispose())
  } catch (error) {
    try { router.dispose() } catch (cleanupError) { ctx.logger.error(cleanupError) }
    throw error
  }
  return { bind: agent => router.bind(String(agent.id)), dispose: () => router.dispose() }
}
