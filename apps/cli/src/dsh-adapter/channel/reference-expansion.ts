import { extname, isAbsolute, join } from 'node:path'
import { extractMentions } from '../../utils/mentions.js'
import { COMPOSER_IMAGE_TOKEN } from './composer-images.js'
import { basename } from './paths.js'
import type {
  MentionAttachments, MentionExpansion, MentionFs, MentionImageBlock,
  MentionImageMediaType, ResolvedMention,
} from './types.js'

export const MENTION_MAX_FILE_CHARS = 50_000
export const MENTION_MAX_TOTAL_CHARS = 200_000
export const MENTION_MAX_DIR_ENTRIES = 200

export const MENTION_IMAGE_MEDIA_TYPES: Readonly<Record<string, MentionImageMediaType>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

export function mentionImageMediaType(path: string): MentionImageMediaType | undefined {
  return MENTION_IMAGE_MEDIA_TYPES[extname(path).toLowerCase()]
}

export async function tryResolveMention(fs: MentionFs, path: string): Promise<ResolvedMention | undefined> {
  try {
    const target = await fs.resolve(path)
    const info = await fs.stat(target)
    return info ? { target, info } : undefined
  } catch {
    return undefined
  }
}

type Mention = ReturnType<typeof extractMentions>[number]
type ImageAttachment = MentionImageBlock['attachment']
type Reference =
  | { kind: 'file'; position: number; mention: Mention }
  | { kind: 'staged'; position: number; token: string; attachment: ImageAttachment }

function referencesInText(
  text: string,
  fs: MentionFs | undefined,
  staged: ReadonlyMap<string, ImageAttachment> | undefined,
): Reference[] {
  const references: Reference[] = fs
    ? extractMentions(text).map(mention => ({ kind: 'file', position: mention.start, mention }))
    : []
  if (staged) {
    const seen = new Set<string>()
    for (const match of text.matchAll(COMPOSER_IMAGE_TOKEN)) {
      const token = match[0]
      if (seen.has(token)) continue
      seen.add(token)
      const attachment = staged.get(token)
      if (attachment) references.push({ kind: 'staged', position: match.index, token, attachment })
    }
  }
  return references.sort((left, right) => left.position - right.position)
}

function candidatePath(cwd: string, path: string): string {
  return isAbsolute(path) ? path : join(cwd, path)
}

function selectedText(mention: Mention, shownPath: string, content: string, literalFallback: boolean): {
  header: string; body: string
} {
  if (literalFallback || mention.startLine === undefined) {
    return { header: `<attached-file path="${shownPath}">`, body: content }
  }
  const lines = content.split('\n')
  if (mention.startLine > lines.length) {
    const count = lines.length
    return {
      header: `<attached-file path="${shownPath}" lines="${mention.startLine}-${mention.endLine}" note="requested lines beyond EOF (file has ${count} line${count === 1 ? '' : 's'}); whole file attached">`,
      body: content,
    }
  }
  const end = Math.min(mention.endLine ?? mention.startLine, lines.length)
  return {
    header: `<attached-file path="${shownPath}" lines="${mention.startLine}${end === mention.startLine ? '' : `-${end}`}">`,
    body: lines.slice(mention.startLine - 1, end).join('\n'),
  }
}

/** Expand typed file references and staged images into one ordered user message. */
export async function expandMentions(
  fs: MentionFs | undefined,
  cwd: string,
  text: string,
  attachments?: MentionAttachments,
  stagedImages?: ReadonlyMap<string, ImageAttachment>,
): Promise<MentionExpansion> {
  const expansion: MentionExpansion = { blocks: [{ type: 'text', text }], attached: [], missing: [] }
  const remaining = { text: MENTION_MAX_TOTAL_CHARS, imageBytes: 0, images: 0 }
  const limits = attachments?.imageLimits

  for (const reference of referencesInText(text, fs, stagedImages)) {
    if (reference.kind === 'staged') {
      const { attachment, token } = reference
      if (!attachments || !limits || remaining.images >= limits.maxImagesPerMessage ||
          remaining.imageBytes + attachment.bytes > limits.maxMessageImageBytes ||
          !limits.mediaTypes.includes(attachment.mediaType)) {
        expansion.missing.push(token)
      } else {
        expansion.blocks.push({ type: 'image', attachment })
        remaining.images++
        remaining.imageBytes += attachment.bytes
      }
      continue
    }

    if (!fs) continue
    const { mention } = reference
    const typedPath = mention.literal ?? mention.path
    const originalImageType = mentionImageMediaType(mention.path)
    if (remaining.text <= 0 && !originalImageType) continue

    let resolved = await tryResolveMention(fs, candidatePath(cwd, mention.path))
    let literalFallback = false
    if (!resolved && mention.literal !== undefined) {
      resolved = await tryResolveMention(fs, candidatePath(cwd, mention.literal))
      literalFallback = resolved !== undefined
    }
    if (!resolved) {
      expansion.missing.push(typedPath)
      continue
    }

    const { target, info } = resolved
    const shownPath = literalFallback ? typedPath : mention.path
    if (info.type === 'file') {
      const imageType = literalFallback ? mentionImageMediaType(typedPath) : originalImageType
      if (imageType && attachments && limits && fs.readBytes) {
        if (remaining.images >= limits.maxImagesPerMessage || !limits.mediaTypes.includes(imageType)) {
          expansion.missing.push(typedPath)
          continue
        }
        try {
          const bytes = await fs.readBytes(target, undefined, limits.maxImageBytes)
          if (remaining.imageBytes + bytes.byteLength > limits.maxMessageImageBytes) {
            expansion.missing.push(typedPath)
            continue
          }
          const attachment = await attachments.saveImage({
            data: bytes, mediaType: imageType, name: basename(target.displayPath),
          })
          expansion.blocks.push({ type: 'image', attachment })
          expansion.attached.push(typedPath)
          remaining.images++
          remaining.imageBytes += bytes.byteLength
        } catch {
          expansion.missing.push(typedPath)
        }
        continue
      }

      try {
        const content = await fs.readText(target)
        const selected = selectedText(mention, shownPath, content, literalFallback)
        const cap = Math.min(MENTION_MAX_FILE_CHARS, remaining.text)
        const truncated = selected.body.length > cap
        const body = truncated ? selected.body.slice(0, cap) : selected.body
        remaining.text -= body.length
        expansion.blocks.push({ type: 'text', text:
          `${selected.header}\n${body}${truncated ? '\n[… truncated]' : ''}\n</attached-file>` })
        expansion.attached.push(typedPath)
      } catch {
        expansion.missing.push(typedPath)
      }
      continue
    }

    if (info.type === 'directory') {
      try {
        const entries = await fs.listDir(target)
        const listed = entries.slice(0, MENTION_MAX_DIR_ENTRIES).map(entry =>
          entry.type === 'directory' ? `${entry.name}/` : entry.name)
        if (entries.length > MENTION_MAX_DIR_ENTRIES) {
          listed.push(`… (${entries.length - MENTION_MAX_DIR_ENTRIES} more)`)
        }
        const body = listed.join('\n')
        remaining.text -= body.length
        expansion.blocks.push({ type: 'text', text:
          `<attached-directory path="${shownPath}">\n${body}\n</attached-directory>` })
        expansion.attached.push(typedPath)
      } catch {
        expansion.missing.push(typedPath)
      }
      continue
    }

    expansion.missing.push(typedPath)
  }
  return expansion
}
