/**
 * Line-range `@` mention regression (issue #359): a `#L12-14` suffix must
 * slice the attached file to that 1-based inclusive range, clamp an endLine
 * past EOF to the file length, fall back to the whole file (with an in-band
 * note) when the START line is past EOF, retry the typed literal when only
 * that resolves (filenames genuinely containing `#L…`), and keep whole-file
 * behavior for suffix-less mentions. Directory mentions ignore the suffix.
 * Run: node --import tsx/esm scripts/verify-mention-lines.ts
 */
import assert from 'node:assert/strict'
import { basename } from 'node:path'
import { expandMentions, type MentionFs } from '../src/dsh-adapter/channel.js'
import { expandComposerMentions } from '../src/dsh-adapter/channel/composer-mentions.js'

const FILES: Record<string, string> = {
  'a.ts': Array.from({ length: 10 }, (_, i) => `line-${i + 1}`).join('\n'),
  'lit#L12': 'literal-hash-file-content',
}
const DIRECTORIES = new Set(['dir'])

/** In-memory MentionFs: resolve echoes the path's basename (mentions arrive
 * joined onto the cwd on every platform), stat classifies it, so a missing
 * file stats `undefined` (the real service's absent shape, which the
 * strip-first fallback must treat as a miss just like a thrown error). */
const fs: MentionFs = {
  resolve: async (path: string) => ({ displayPath: basename(path) }),
  stat: async (target: { displayPath: string }) => {
    if (DIRECTORIES.has(target.displayPath)) return { type: 'directory' as const }
    return FILES[target.displayPath] === undefined ? undefined : { type: 'file' as const }
  },
  readText: async (target: { displayPath: string }) => {
    const content = FILES[target.displayPath]
    if (content === undefined) throw new Error(`ENOENT: ${target.displayPath}`)
    return content
  },
  listDir: async () => [{ name: 'child.ts', type: 'file' as const }],
}

const run = (text: string) => expandMentions(fs, '/ws', text)
const textBlock = (blocks: Awaited<ReturnType<typeof run>>['blocks'], index: number) => {
  const block = blocks[index]
  assert.ok(block !== undefined && block.type === 'text', `block ${index} should be text`)
  return block.text
}

// 1. Plain range: only the requested lines reach the model.
{
  const result = await run('check @a.ts#L2-4')
  assert.deepEqual(result.attached, ['a.ts#L2-4'])
  assert.equal(result.missing.length, 0)
  const text = textBlock(result.blocks, 1)
  assert.ok(text.startsWith('<attached-file path="a.ts" lines="2-4">\n'))
  assert.match(text, /line-2/)
  assert.match(text, /line-4/)
  assert.doesNotMatch(text, /line-1/)
  assert.doesNotMatch(text, /line-5/)
}

// 2. Single line: `#L7` renders as lines="7" with exactly that line.
{
  const result = await run('check @a.ts#L7')
  const text = textBlock(result.blocks, 1)
  assert.ok(text.startsWith('<attached-file path="a.ts" lines="7">\n'))
  assert.match(text, /line-7/)
  assert.doesNotMatch(text, /line-6/)
}

// 3. endLine past EOF clamps to the file length.
{
  const result = await run('check @a.ts#L8-99')
  const text = textBlock(result.blocks, 1)
  assert.ok(text.startsWith('<attached-file path="a.ts" lines="8-10">\n'))
  assert.match(text, /line-10/)
}

// 4. startLine past EOF: whole file attached with an in-band note.
{
  const result = await run('check @a.ts#L99')
  assert.equal(result.missing.length, 0)
  const text = textBlock(result.blocks, 1)
  assert.match(text, /<attached-file path="a\.ts" lines="99-99" note="[^"]*beyond EOF[^"]*">/)
  assert.match(text, /line-1\b/)
}

// 5. Literal fallback: only `lit#L12` exists — whole file, TYPED path shown.
{
  const result = await run('check @lit#L12')
  assert.deepEqual(result.attached, ['lit#L12'])
  const text = textBlock(result.blocks, 1)
  assert.ok(text.startsWith('<attached-file path="lit#L12">\n'))
  assert.match(text, /literal-hash-file-content/)
}

// 6. Both forms miss: loud missing with the TYPED token.
{
  const result = await run('check @gone#L5')
  assert.deepEqual(result.missing, ['gone#L5'])
  assert.equal(result.blocks.length, 1)
}

// 7. Suffix-less mentions are unchanged (whole file, no lines attribute).
{
  const result = await run('check @a.ts')
  const text = textBlock(result.blocks, 1)
  assert.ok(text.startsWith('<attached-file path="a.ts">\n'))
  assert.match(text, /line-1\b/)
  assert.match(text, /line-10\b/)
}

// 8. Directory mention with a suffix: listing attaches, suffix ignored.
{
  const result = await run('check @dir#L3')
  assert.equal(result.missing.length, 0)
  const text = textBlock(result.blocks, 1)
  assert.ok(text.startsWith('<attached-directory path="dir">\n'))
  assert.match(text, /child\.ts/)
}

// A submitted reference cannot spend more than its per-file cap or the whole
// message's text budget. Both entry points must apply the same policy.
{
  const oversized = 'x'.repeat(60_000)
  const largeFs: MentionFs = {
    resolve: async path => ({ displayPath: basename(path) }),
    stat: async target => ({ type: target.displayPath === 'dir' ? 'directory'
      : target.displayPath === 'special' ? 'other' : 'file' }),
    readText: async () => oversized,
    listDir: async () => Array.from({ length: 203 }, (_, i) => ({ name: `entry-${i}`, type: 'file' as const })),
  }
  const input = Array.from({ length: 5 }, (_, i) => `@file-${i}.txt`).join(' ')
  const result = await expandMentions(largeFs, '/ws', input)
  assert.equal(result.blocks.length, 5, 'four capped files exhaust the total text budget')
  assert.deepEqual(result.attached, ['file-0.txt', 'file-1.txt', 'file-2.txt', 'file-3.txt'])
  for (let i = 1; i <= 4; i++) {
    const block = textBlock(result.blocks, i)
    const body = block.match(/<attached-file[^>]*>\n(x+)\n\[… truncated\]/u)?.[1]
    assert.equal(body?.length, 50_000)
  }
  assert.deepEqual(await expandComposerMentions(largeFs, '/ws', input), result)
  const directory = await expandMentions(largeFs, '/ws', '@dir @special')
  assert.match(textBlock(directory.blocks, 1), /entry-199\n… \(3 more\)/u)
  assert.doesNotMatch(textBlock(directory.blocks, 1), /entry-200/u)
  assert.deepEqual(directory.missing, ['special'])
}

console.log('verify-mention-lines: all assertions passed')
