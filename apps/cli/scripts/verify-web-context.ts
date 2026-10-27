import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, readdir, stat, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { AgentSession } from '../src/agent/session.js'
import { createWebContextManager } from '../lib/types/dsh-adapter/web-context-manager.js'

const root = await mkdtemp(join(tmpdir(), 'flagqai-web-context-'))
const outside = await mkdtemp(join(tmpdir(), 'flagqai-web-outside-'))
try {
  await writeFile(join(root, 'circuit.py'), 'first\nsecond\nthird\nfourth\n')
  await writeFile(join(root, '.env'), 'private fixture')
  await writeFile(join(outside, 'outside.txt'), 'outside fixture')
  await symlink(join(outside, 'outside.txt'), join(root, 'escape.txt'))
  const saved: unknown[] = []
  const services: Record<string, unknown> = {
    fs: {
      resolve: async (path: string) => ({ displayPath: path }),
      stat: async (target: { displayPath: string }) => ({ type: (await stat(target.displayPath)).isDirectory() ? 'directory' : 'file' }),
      readText: (target: { displayPath: string }) => readFile(target.displayPath, 'utf8'),
      listDir: async (target: { displayPath: string }) => (await readdir(target.displayPath, { withFileTypes: true })).map(entry => ({ name: entry.name, type: entry.isDirectory() ? 'directory' : 'file' })),
    },
    llm: { listModels: async () => [{ id: 'vision', inputModalities: ['text', 'image'] }, { id: 'text', inputModalities: ['text'] }] },
    attachments: {
      imageLimits: { maxImagesPerMessage: 4, maxMessageImageBytes: 4096, mediaTypes: ['image/png'] },
      saveImage: async (input: unknown) => { saved.push(input); return { attachmentId: 'image-fixture', mediaType: 'image/png', bytes: 3, width: 1, height: 1 } },
    },
  }
  const manager = createWebContextManager({ get: (id: string) => services[id] } as unknown as Context)
  const session = { ref: { backendId: 'dsh', sessionId: 'test' }, cwd: root, capabilities: { native: { dsh: { modelRoute: { provider: 'test', model: 'vision' } } } } } as unknown as AgentSession
  assert.equal((await manager.status(session)).images, 'supported')
  assert.equal((await manager.list(session, '')).some(item => item.path === '.env'), false)
  const preview = await manager.preview(session, 'Explain @circuit.py#L2-3')
  assert.match(preview.blocks[0]!, /second\nthird/)
  assert.doesNotMatch(preview.blocks[0]!, /first|fourth/)
  const input = { clientMessageId: 'input', text: 'Explain @circuit.py#L2-3' }
  const expanded = await manager.prepare(session, input)
  assert.equal(expanded.text, input.text)
  assert.equal(expanded.blocks!.length, 2)
  assert.match(expanded.blocks![1]!.text!, /second\nthird/)
  for (const path of ['escape.txt', '.env', join(outside, 'outside.txt')]) {
    await assert.rejects(manager.prepare(session, { ...input, text: `Explain @${path}` }), /cannot be attached/)
  }
  const uploaded = await manager.prepare(session, { ...input, text: 'Explain the image' }, [{ name: 'test.png', mediaType: 'image/png', data: 'YWJj' }])
  assert.equal(saved.length, 1)
  assert.equal(uploaded.blocks![1]!.type, 'image')
  assert.match(uploaded.text, /\[Image #1\]/)
  services.llm = { listModels: async () => [{ id: 'vision', inputModalities: ['text'] }] }
  await assert.rejects(manager.prepare(session, input, [{ name: 'test.png', mediaType: 'image/png', data: 'YWJj' }]), /does not support image/)
  assert.equal(saved.length, 1)
  console.log('PASS Web context shares CLI line-range expansion, confines files, retains image blocks and refuses unsupported images')
} finally {
  await rm(root, { recursive: true, force: true })
  await rm(outside, { recursive: true, force: true })
}
