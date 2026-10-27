/**
 * Connect the Harness user-question protocol to the CLI's shared question
 * queue. The queue owns presentation and cancellation; Harness supplies the
 * error type expected by its tool and session machinery.
 */

import {
  UserQuestionError,
  type AskUserQuestionAnswer,
  type AskUserQuestionRequest,
} from '@deepseek-ai/dsh-user-questions'
import {
  assertCapabilityShadowPolicy,
  defaultAdapterRuntime,
  type AdapterRuntimeOptions,
} from '../adapter/kernel/runtime.js'
import { QuestionStore as SharedQuestionStore } from '../channel/questions.js'
import { compositionRoot } from './host-access.js'

export class QuestionStore extends SharedQuestionStore {
  constructor(runtime: AdapterRuntimeOptions = defaultAdapterRuntime()) {
    super({
      runtime,
      interruption: (message, code) => new UserQuestionError(message, code),
    })
  }

  override ask(
    request: AskUserQuestionRequest,
    options?: { redact?: boolean },
  ): Promise<AskUserQuestionAnswer> {
    assertCapabilityShadowPolicy('host.presentation.ask', this.runtime.mode, this.runtime.slices)
    return super.ask(request, options)
  }
}

const mountedStores = new WeakMap<object, QuestionStore>()

/** Bind a question queue to its composition root, including child contexts. */
export function bindQuestionStore(ctx: Parameters<typeof compositionRoot>[0], store: QuestionStore): void {
  mountedStores.set(compositionRoot(ctx), store)
}

/** Resolve the question queue mounted for a context's composition root. */
export function getQuestionStore(ctx: Parameters<typeof compositionRoot>[0]): QuestionStore | undefined {
  return mountedStores.get(compositionRoot(ctx))
}
