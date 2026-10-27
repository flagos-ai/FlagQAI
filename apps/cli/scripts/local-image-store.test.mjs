import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createLocalImageStore, LOCAL_IMAGE_LIMIT } from '../lib/types/dsh-adapter/channel/core/local-images.js'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pXcAAAAASUVORK5CYII=', 'base64')
const policy = () => ({
  mediaTypes: ['image/png', 'image/jpeg'],
  maxImageBytes: 1024,
  maxImagesPerMessage: 4,
  maxMessageImageBytes: 4096,
  maxImageDimension: 16,
  maxImagePixels: 256,
})

test('staged bytes cannot be modified by the caller or facade consumer', async () => {
  const store = createLocalImageStore(policy)
  const source = Uint8Array.from(png)
  const ref = await store.saveImage({ data: source, mediaType: 'image/jpeg', name: 'sample.png' })
  assert.equal(ref.mediaType, 'image/png')
  assert.deepEqual([ref.width, ref.height], [1, 1])
  const view = store.facade(ref)
  assert.equal(view?.name, 'sample.png')
  source[0] = 0
  assert.equal((await view.read())[0], png[0])
  const read = await view.read()
  read[0] = 0
  assert.equal(store.bytes(String(ref.attachmentId))[0], png[0])
  const cancelled = new AbortController()
  cancelled.abort()
  await assert.rejects(view.read(cancelled.signal), { name: 'AbortError' })
})

test('oldest image is evicted and its facade never retains bytes', async () => {
  const store = createLocalImageStore(policy)
  const first = await store.saveImage({ data: Uint8Array.from(png), mediaType: 'image/png' })
  const firstView = store.facade(first)
  for (let index = 0; index < LOCAL_IMAGE_LIMIT; index++) {
    await store.saveImage({ data: Uint8Array.from([...png, index]), mediaType: 'image/png' })
  }
  assert.equal(store.facade(first), undefined)
  assert.equal(store.bytes(String(first.attachmentId)), undefined)
  await assert.rejects(firstView.read(), /no longer available/)
})

test('per-image bytes and unsupported formats fail before staging', async () => {
  const store = createLocalImageStore(() => ({ ...policy(), maxImageBytes: png.length - 1 }))
  await assert.rejects(store.saveImage({ data: png, mediaType: 'image/png' }), /per-image size limit/)
  await assert.rejects(store.saveImage({ data: Uint8Array.of(1, 2, 3), mediaType: 'image/png' }), /image cannot be admitted/)
  assert.equal(store.bytes('none'), undefined)
})
