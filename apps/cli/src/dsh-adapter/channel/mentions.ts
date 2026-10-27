import type { Context } from '@deepseek-ai/cordis'
import type { MentionAttachments, MentionFs } from './types.js'

export {
  MENTION_MAX_DIR_ENTRIES,
  MENTION_MAX_FILE_CHARS,
  MENTION_MAX_TOTAL_CHARS,
  MENTION_IMAGE_MEDIA_TYPES,
  expandMentions,
  mentionImageMediaType,
  tryResolveMention,
} from './reference-expansion.js'

/** A missing fs service leaves typed references untouched. */
export function mentionFs(ctx: Context): MentionFs | undefined {
  return ctx.get('fs') as MentionFs | undefined
}

export function mentionAttachments(ctx: Context): MentionAttachments | undefined {
  return ctx.get('attachments') as MentionAttachments | undefined
}
