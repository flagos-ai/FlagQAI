/** Volatile image attachments for sessions whose image capability owns delivery. */
import { createHash } from 'node:crypto'
import type { TranscriptImage } from '../../../adapter/ports/channel-view.js'
import type { ImageLimitsView } from '../../../agent/capabilities.js'
import { adaptImageForAdmission, probeImageSize, sniffImageMediaType, withinDimensionLimits } from '../../../utils/imageResize.js'
import type { MentionAttachments, MentionImageBlock, MentionImageMediaType } from '../types.js'

type ImageRef = MentionImageBlock['attachment']
export const LOCAL_IMAGE_LIMIT = 64
export const LOCAL_IMAGE_BYTES = 96 * 1024 * 1024
export interface LocalImageStore extends MentionAttachments {
  facade(attachment: ImageRef): TranscriptImage | undefined
  bytes(attachmentId: string): Uint8Array | undefined
}
const SUPPORTED_MEDIA_TYPES: readonly MentionImageMediaType[] = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

/** The map's insertion order is its eviction order. No image bytes reach disk. */
export function createLocalImageStore(limits: () => ImageLimitsView): LocalImageStore {
  const entries = new Map<string, Uint8Array>()
  const views = new Map<string, TranscriptImage>()
  let usedBytes = 0
  const currentLimits = (): MentionAttachments['imageLimits'] => {
    const profile = limits()
    return {
      maxImageBytes: Math.min(profile.maxImageBytes, LOCAL_IMAGE_BYTES),
      maxImagesPerMessage: profile.maxImagesPerMessage,
      maxMessageImageBytes: profile.maxMessageImageBytes,
      maxImageDimension: profile.maxImageDimension,
      maxImagePixels: profile.maxImagePixels,
      mediaTypes: SUPPORTED_MEDIA_TYPES.filter(type => profile.mediaTypes.includes(type)),
    }
  }
  const evict = (): void => {
    while (entries.size > LOCAL_IMAGE_LIMIT || usedBytes > LOCAL_IMAGE_BYTES) {
      const first = entries.keys().next().value
      if (first === undefined) break
      const removed = entries.get(first)
      entries.delete(first)
      views.delete(first)
      usedBytes -= removed?.byteLength ?? 0
    }
  }
  return {
    get imageLimits() { return currentLimits() },
    async saveImage(input): Promise<ImageRef> {
      const policy = currentLimits()
      let data = Uint8Array.from(input.data)
      let mediaType = sniffImageMediaType(data) ?? input.mediaType
      let size = probeImageSize(data)
      const sourceSize = size
      const dimensions = { maxImageDimension: policy.maxImageDimension, maxImagePixels: policy.maxImagePixels }
      if (!policy.mediaTypes.includes(mediaType) || size === null || !withinDimensionLimits(size, dimensions)) {
        const adapted = await adaptImageForAdmission(data, mediaType, dimensions, policy.mediaTypes)
        if (adapted.kind === 'adapted') {
          data = Uint8Array.from(adapted.data)
          mediaType = adapted.mediaType as MentionImageMediaType
          size = { width: adapted.width, height: adapted.height }
        } else if (adapted.kind === 'unavailable' && (size === null || !policy.mediaTypes.includes(mediaType) || !withinDimensionLimits(size, dimensions))) {
          throw new Error(`image cannot be admitted: ${adapted.detail}`)
        }
      }
      if (!policy.mediaTypes.includes(mediaType)) throw new Error(`${mediaType} images are not accepted by this profile`)
      if (size === null || !withinDimensionLimits(size, dimensions)) throw new Error('image dimensions exceed this profile')
      if (data.byteLength > policy.maxImageBytes) throw new Error('image exceeds the per-image size limit')
      const id = `local-${createHash('sha256').update(data).digest('hex').slice(0, 32)}`
      const ref: ImageRef = {
        attachmentId: id as ImageRef['attachmentId'],
        mediaType,
        bytes: data.byteLength,
        width: size.width,
        height: size.height,
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(sourceSize !== null && (sourceSize.width !== size.width || sourceSize.height !== size.height)
          ? { originalDimensions: sourceSize } : {}),
      }
      const previous = entries.get(id)
      if (previous !== undefined) {
        usedBytes -= previous.byteLength
        entries.delete(id)
      }
      entries.set(id, data)
      usedBytes += data.byteLength
      evict()
      return ref
    },
    facade(attachment) {
      const id = String(attachment.attachmentId)
      if (!entries.has(id)) return undefined
      let view = views.get(id)
      if (view === undefined) {
        view = {
          id,
          width: attachment.width,
          height: attachment.height,
          mediaType: attachment.mediaType,
          bytes: attachment.bytes,
          ...(attachment.name === undefined ? {} : { name: attachment.name }),
          read: async (signal?: AbortSignal) => {
            signal?.throwIfAborted()
            const stored = entries.get(id)
            if (stored === undefined) throw new Error('image bytes are no longer available')
            return Uint8Array.from(stored)
          },
        }
        views.set(id, view)
      }
      return view
    },
    bytes(attachmentId) {
      const data = entries.get(attachmentId)
      return data === undefined ? undefined : Uint8Array.from(data)
    },
  }
}
