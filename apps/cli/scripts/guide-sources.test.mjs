import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { renderGuidePage } from './guide-sources.mjs'

test('packaged guide keeps local and anchor links and points source-only docs to the repository', () => {
  const checkout = mkdtempSync(join(tmpdir(), 'flagqai-guide-links-'))
  const root = join(checkout, 'apps', 'cli')
  try {
    mkdirSync(join(root, 'docs'), { recursive: true })
    writeFileSync(join(root, 'README.md'), '# CLI\n')
    writeFileSync(join(root, 'docs', 'architecture.en.md'), '# Architecture\n')
    writeFileSync(join(root, 'docs', 'getting-started.en.md'),
      '[Index](README.md) [Section](#setup) [CLI](../README.md) [Peer](user-guide.en.md) [Design](architecture.en.md#runtime)\n')
    assert.equal(renderGuidePage(root, 'getting-started.en.md'),
      '[Index](SKILL.md) [Section](#setup) [CLI](../../README.md) [Peer](user-guide.en.md) '
      + '[Design](https://github.com/flagos-ai/FlagQAI/blob/main/apps/cli/docs/architecture.en.md#runtime)\n')
    writeFileSync(join(root, 'docs', 'getting-started.en.md'), '[Missing](absent.md)\n')
    assert.throws(() => renderGuidePage(root, 'getting-started.en.md'), /Missing guide source link/u)
  } finally {
    rmSync(checkout, { recursive: true, force: true })
  }
})
