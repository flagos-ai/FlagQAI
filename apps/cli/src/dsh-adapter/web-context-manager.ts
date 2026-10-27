import type { Context } from '@deepseek-ai/cordis'
import type { AgentSession, AgentInput } from '../agent/session.js'
import { extractMentions } from '../utils/mentions.js'
import { recordedModelRoute } from '../modelRoute.js'
import { expandComposerMentions } from './channel/composer-mentions.js'
import { mentionFs, mentionAttachments, mentionImageMediaType } from './channel/mentions.js'
import { listPathCandidates } from './channel/paths.js'
import { createLocalImageStore } from './channel/core/local-images.js'
import type { MentionFs, MentionImageBlock } from './channel/types.js'

export interface WebImageInput { name: string; mediaType: string; data: string }

/** Web ingress uses the CLI expander; only local workspace files are exposed. */
export function createWebContextManager(ctx: Context) {
  async function scopedFs(session: AgentSession): Promise<MentionFs> {
    const modulePath = '../../flagqai-platform/harness-adapter/workspace-files.mjs'
    const { createWorkspaceFileScope } = await import(modulePath) as typeof import('../../../../packages/harness-adapter/workspace-files.mjs')
    return createWorkspaceFileScope(mentionFs(ctx), session.cwd)
  }
  async function imageSupport(session: AgentSession) {
    if (session.capabilities.images) return 'supported'
    if (session.ref.backendId !== 'dsh') return 'unsupported'
    const route = session.capabilities.native?.dsh?.modelRoute ?? recordedModelRoute(session.capabilities.native?.dsh?.rawHistory() ?? [])
    if (!route) return 'unknown'
    const llm = ctx.get('llm') as { listModels(provider: string): Promise<readonly { id: string; inputModalities?: readonly string[] }[]> }
    const model = (await llm.listModels(route.provider)).find(item => item.id === route.model)
    return model?.inputModalities === undefined ? 'unknown' : model.inputModalities.includes('image') ? 'supported' : 'unsupported'
  }
  return {
    async status(session: AgentSession) {
      let files = false
      try { await scopedFs(session); files = true } catch { /* No local file surface. */ }
      return { files, images: await imageSupport(session), maxImageBytes: 2 * 1024 * 1024, maxImages: 4 }
    },
    async list(session: AgentSession, query: string) {
      const fs = await scopedFs(session)
      return listPathCandidates(fs, session.cwd, query, undefined, 20)
    },
    async preview(session: AgentSession, text: string) {
      if (extractMentions(text).length > 16) throw new Error('Too many references')
      const fs = await scopedFs(session)
      const expansion = await expandComposerMentions(fs, session.cwd, text)
      return { references: extractMentions(text).map(mention => ({ ...mention, available: !expansion.missing.includes(mention.literal ?? mention.path) })),
        blocks: expansion.blocks.filter(block => block.type === 'text').slice(1).map(block => block.text?.slice(0, 4000)), missing: expansion.missing }
    },
    async prepare(session: AgentSession, input: AgentInput, uploads: readonly WebImageInput[] = []): Promise<AgentInput> {
      if (extractMentions(input.text).length > 16) throw new Error('Too many references')
      if (!extractMentions(input.text).length && !uploads.length) return input
      const fs = await scopedFs(session)
      const support = await imageSupport(session)
      const imageMentions = extractMentions(input.text).some(item => mentionImageMediaType(item.path) !== undefined)
      if ((uploads.length || imageMentions) && support !== 'supported') throw new Error(support === 'unknown' ? 'Image support is not declared for this model; configure its capabilities first' : 'This model does not support image input')
      const local = session.capabilities.images ? createLocalImageStore(() => session.capabilities.images!.limits) : undefined
      const attachments = local ?? mentionAttachments(ctx)
      const staged = new Map<string, MentionImageBlock['attachment']>()
      for (const [index, upload] of uploads.entries()) {
        if (!attachments) throw new Error('Image attachments are unavailable')
        const attachment = await attachments.saveImage({ data: Buffer.from(upload.data, 'base64'), mediaType: upload.mediaType as 'image/png', name: upload.name })
        staged.set(`[Image #${index + 1}]`, attachment)
      }
      const text = uploads.reduce((value, _upload, index) => value.includes(`[Image #${index + 1}]`) ? value : `${value}\n[Image #${index + 1}]`, input.text)
      const expansion = await expandComposerMentions(fs, session.cwd, text, attachments, staged)
      if (expansion.missing.length) throw new Error('One or more references cannot be attached; review the draft')
      const images = local === undefined ? undefined : expansion.blocks.flatMap(block => block.type === 'image' ? [local.facade(block.attachment)].filter(item => item !== undefined) : [])
      return { ...input, text, blocks: expansion.blocks, ...(images?.length ? { images } : {}) }
    },
  }
}
