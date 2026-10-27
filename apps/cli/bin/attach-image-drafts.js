import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

const maxImageBytes = 2 * 1024 * 1024
const maxTotalBytes = 4 * 1024 * 1024
const maxImages = 4

const mediaTypeByExtension = new Map([
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'], ['.gif', 'image/gif'],
])

export function imageMediaType(name, bytes) {
  const type = mediaTypeByExtension.get(path.extname(name).toLowerCase())
  if (type === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return type
  if (type === 'image/jpeg' && bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return type
  if (type === 'image/gif' && ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6))) return type
  if (type === 'image/webp' && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return type
  return null
}

/** A local draft only; Harness owns the submitted message and image lifetime. */
export function createImageDraftQueue({ cwd = process.cwd(), fileStat = stat, fileRead = readFile } = {}) {
  let entries = []
  return {
    list: () => entries.map(({ name, size }) => ({ name, size })),
    payload: () => entries.map(({ name, mediaType, data }) => ({ name, mediaType, data })),
    clear: () => { entries = [] },
    remove(index) {
      if (!Number.isSafeInteger(index) || index < 1 || index > entries.length) return false
      entries.splice(index - 1, 1)
      return true
    },
    async add(filePath, context) {
      if (context?.images !== 'supported') throw new Error('Image input is not confirmed for this Harness session')
      const allowedCount = Math.min(maxImages, Number.isSafeInteger(context.maxImages) ? context.maxImages : maxImages)
      if (entries.length >= allowedCount) throw new Error(`At most ${allowedCount} images are allowed`)
      const name = path.basename(filePath)
      if (!name || name.length > 256 || !mediaTypeByExtension.has(path.extname(name).toLowerCase())) {
        throw new Error('Choose a PNG, JPEG, WebP, or GIF file with a name under 256 characters')
      }
      const absolutePath = path.resolve(cwd, filePath)
      const info = await fileStat(absolutePath)
      const allowedBytes = Math.min(maxImageBytes, Number.isSafeInteger(context.maxImageBytes) ? context.maxImageBytes : maxImageBytes)
      if (!info.isFile() || info.size < 1 || info.size > allowedBytes) throw new Error(`Image must be a nonempty regular file of at most ${allowedBytes} bytes`)
      const bytes = await fileRead(absolutePath)
      if (bytes.length !== info.size || bytes.length > allowedBytes) throw new Error('Image changed while reading; choose it again')
      if (entries.reduce((total, entry) => total + entry.size, bytes.length) > maxTotalBytes) {
        throw new Error('Pending images may total at most 4 MiB')
      }
      const mediaType = imageMediaType(name, bytes)
      if (!mediaType) throw new Error('Image signature does not match its supported filename extension')
      entries.push({ name, mediaType, data: bytes.toString('base64'), size: bytes.length })
      return { name, size: bytes.length }
    },
  }
}

export async function handleImageDraftCommand(line, { queue, client, sessionId, signal, write, warn }) {
  if (line !== '/image' && !line.startsWith('/image ')) return false
  const argument = line.slice('/image'.length).trim()
  if (argument === '') {
    const pending = queue.list()
    write(pending.length ? `Pending images:\n${pending.map((item, index) => `${index + 1}. ${JSON.stringify(item.name)} (${item.size} bytes)`).join('\n')}\n` : 'No pending images.\n')
    write('Use /image <local path>, /image remove <number>, or /image clear.\n')
    return true
  }
  if (argument === 'clear') {
    queue.clear()
    write('Pending images cleared.\n')
    return true
  }
  if (argument.startsWith('remove ')) {
    const index = argument.slice('remove '.length)
    write(/^[1-9]\d*$/u.test(index) && queue.remove(Number(index))
      ? 'Pending image removed.\n' : 'Choose an image number from /image.\n')
    return true
  }
  try {
    const context = await client.sessionContext(sessionId, { signal })
    const image = await queue.add(argument, context)
    write(`Queued ${JSON.stringify(image.name)} (${image.size} bytes) for the next message.\n`)
  } catch (error) {
    if (signal?.aborted) throw error
    warn(`FlagQAI attach: ${error instanceof Error ? error.message : String(error)}. No image was queued.\n`)
  }
  return true
}
