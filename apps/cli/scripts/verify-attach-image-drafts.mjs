import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { createImageDraftQueue, handleImageDraftCommand, imageMediaType } from '../bin/attach-image-drafts.js'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==', 'base64')
const workspace = await mkdtemp(path.join(tmpdir(), 'flagqai-image-draft-'))
try {
  await writeFile(path.join(workspace, 'sample.png'), png)
  await writeFile(path.join(workspace, 'bad.jpg'), png)
  const queue = createImageDraftQueue({ cwd: workspace })
  const output = []
  let supported = true
  const run = line => handleImageDraftCommand(line, {
    queue, client: {sessionContext: async id => {
      assert.equal(id, 'resource-1')
      return {images: supported ? 'supported' : 'unknown', maxImageBytes: 2 * 1024 * 1024, maxImages: 1}
    }}, sessionId: 'resource-1', write: text => output.push(text), warn: text => output.push(text),
  })
  assert.equal(await run('/not-image'), false)
  assert.equal(imageMediaType('sample.png', png), 'image/png')
  assert.equal(imageMediaType('bad.jpg', png), null)
  supported = false
  assert.equal(await run('/image sample.png'), true)
  assert.equal(queue.list().length, 0, 'unknown capability must fail closed')
  supported = true
  await run('/image bad.jpg')
  assert.equal(queue.list().length, 0, 'signature mismatch must not queue')
  await run('/image sample.png')
  assert.deepEqual(queue.payload(), [{name: 'sample.png', mediaType: 'image/png', data: png.toString('base64')}])
  await run('/image sample.png')
  assert.equal(queue.list().length, 1, 'server image count must be respected')
  await run('/image')
  assert.match(output.join(''), /1\. "sample.png"/)
  await run('/image remove 2')
  assert.equal(queue.list().length, 1)
  await run('/image remove 1')
  assert.equal(queue.list().length, 0)
  await run('/image sample.png')
  await run('/image clear')
  assert.equal(queue.list().length, 0)
  const oversized = createImageDraftQueue({cwd: workspace,
    fileStat: async () => ({isFile: () => true, size: 2 * 1024 * 1024 + 1}),
    fileRead: async () => { throw new Error('oversized file should not be read') },
  })
  await assert.rejects(() => oversized.add('sample.png', {images: 'supported'}), /at most 2097152 bytes/)
  const largeJpeg = Buffer.alloc(1_500_000)
  largeJpeg.set([255, 216, 255])
  const aggregate = createImageDraftQueue({cwd: workspace,
    fileStat: async () => ({isFile: () => true, size: largeJpeg.length}),
    fileRead: async () => largeJpeg,
  })
  const roomy = {images: 'supported', maxImages: 4, maxImageBytes: 2 * 1024 * 1024}
  await aggregate.add('a.jpg', roomy)
  await aggregate.add('b.jpg', roomy)
  await assert.rejects(() => aggregate.add('c.jpg', roomy), /total at most 4 MiB/)
  assert.equal(aggregate.list().length, 2)
  const changed = createImageDraftQueue({cwd: workspace,
    fileStat: async () => ({isFile: () => true, size: png.length + 1}),
    fileRead: async () => png,
  })
  await assert.rejects(() => changed.add('sample.png', roomy), /changed while reading/)
  assert.match(output.join(''), /Image input is not confirmed/)
  assert.match(output.join(''), /signature does not match/)
  console.log('PASS attach image drafts: capability, format, limits, list, removal and clear')
} finally {
  await rm(workspace, {recursive: true, force: true})
}
