/** Durable image references projected into lazy, UI-safe transcript views. */
import { isAbsolute } from 'node:path'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { TranscriptImage } from '../adapter/ports/channel-view.js'

export type { TranscriptImage }

interface ImageReader {
  readImage(ref: ImageAttachmentRef, signal?: AbortSignal): Promise<{ data: Uint8Array }>
}

const recentPaths = new Map<string, string>()
const MAX_RECENT_PATHS = 256
const RASTER_MEDIA_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

/** Keep a display-only local source path; never add it to a durable event. */
export function rememberImagePath(attachmentId: string, path: string): void {
  if (!attachmentId || !isAbsolute(path)) return
  recentPaths.delete(attachmentId)
  recentPaths.set(attachmentId, path)
  while (recentPaths.size > MAX_RECENT_PATHS) {
    const oldest = recentPaths.keys().next().value
    if (oldest === undefined) break
    recentPaths.delete(oldest)
  }
}

function validImage(ref: unknown): ref is ImageAttachmentRef {
  if (ref === null || typeof ref !== 'object') return false
  const image = ref as Partial<ImageAttachmentRef>
  return typeof image.attachmentId === 'string' && image.attachmentId.length > 0
    && typeof image.mediaType === 'string' && RASTER_MEDIA_TYPES.has(image.mediaType)
    && typeof image.bytes === 'number' && Number.isFinite(image.bytes) && image.bytes >= 0
    && typeof image.width === 'number' && Number.isSafeInteger(image.width) && image.width > 0
    && typeof image.height === 'number' && Number.isSafeInteger(image.height) && image.height > 0
}

function imageReader(value: unknown): ImageReader | undefined {
  if (value === null || typeof value !== 'object') return undefined
  return typeof (value as { readImage?: unknown }).readImage === 'function'
    ? value as ImageReader : undefined
}

/** The attachment provider is resolved at read time, after a late mount. */
export function transcriptImageFromAttachment(
  attachment: unknown,
  attachments: () => unknown,
): TranscriptImage | undefined {
  if (!validImage(attachment)) return undefined
  const id = String(attachment.attachmentId)
  const path = recentPaths.get(id)
  return {
    id,
    width: attachment.width,
    height: attachment.height,
    ...(typeof attachment.name === 'string' ? { name: attachment.name } : {}),
    mediaType: attachment.mediaType,
    bytes: attachment.bytes,
    ...(path === undefined ? {} : { path }),
    async read(signal) {
      const reader = imageReader(attachments())
      if (reader === undefined) throw new Error('Image attachment store unavailable')
      const result = await reader.readImage(attachment, signal)
      if (!(result?.data instanceof Uint8Array)) throw new Error('Image attachment bytes unavailable')
      return result.data
    },
  }
}

/** Walk content in display order, including nested tool-result blocks. */
export function transcriptImagesOf(
  content: readonly unknown[] | undefined,
  attachments: () => unknown,
): TranscriptImage[] {
  const images: TranscriptImage[] = []
  const visiting = new WeakSet<object>()
  const visit = (blocks: unknown, depth: number): void => {
    if (!Array.isArray(blocks) || depth > 32 || visiting.has(blocks)) return
    visiting.add(blocks)
    for (const block of blocks) {
      if (block === null || typeof block !== 'object') continue
      const entry = block as { type?: unknown; attachment?: unknown; content?: unknown }
      if (entry.type === 'image') {
        const image = transcriptImageFromAttachment(entry.attachment, attachments)
        if (image !== undefined) images.push(image)
      } else if (entry.type === 'tool-result') {
        visit(entry.content, depth + 1)
      }
    }
    visiting.delete(blocks)
  }
  visit(content, 0)
  return images
}
