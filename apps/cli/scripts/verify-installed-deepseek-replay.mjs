/** Offline acceptance of the compiled compatibility code in a relocated archive. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { packFlagqai } from './pack-flagqai.mjs'

const root = await mkdtemp(join(tmpdir(), 'flagqai-installed-replay-'))
try {
  const archive = await packFlagqai({ destination: root })
  const installed = join(root, 'relocated')
  await mkdir(installed)
  execFileSync('tar', ['-xzf', archive.path, '-C', installed])
  // No dependency install, source imports, provider credentials or network are
  // needed by these compiled boundary modules. The child runs outside the repo.
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict'
    import { deepSeekReplayStream } from './package/lib/types/dsh-adapter/compat/deepseekStream.js'
    import { withProviderProtocolDefaults } from './package/lib/flagqai-platform/harness-adapter/provider-manager.mjs'
    globalThis.fetch = () => { throw new Error('Network is forbidden in offline acceptance') }
    const model = 'deepseek-v4.1-flash'
    const profiles = [
      { route: 'bridge', ref: 'FIXTURE', baseURL: 'https://zyapi.xmsxb.com', api: 'anthropic-messages', models: [model] },
      { route: 'native', ref: 'FIXTURE', baseURL: 'https://zyapi.xmsxb.com/v1', api: 'openai-completions', models: [model] },
    ]
    const original = [{ id: model }]
    assert.equal(withProviderProtocolDefaults('anthropic-messages', original)[0].compat.allowEmptySignature, true)
    assert.equal(original[0].compat, undefined)
    const controller = new AbortController()
    const input = Object.freeze({ provider: 'bridge', model, signal: controller.signal,
      messages: [{ role: 'assistant', content: [{ type: 'reasoning', text: 'Check saved artifacts.' }],
        source: { kind: 'model', provider: 'bridge', model, replayState: {
          response: { kind: 'pi-ai', version: 2, api: 'anthropic-messages', provider: 'bridge', model },
          blocks: [{ type: 'reasoning', thinkingSignature: '' }],
        } } }],
    })
    const before = JSON.stringify(input)
    let calls = 0
    const chunks = []
    for await (const chunk of deepSeekReplayStream(input, profiles, async function* (request) {
      calls++
      assert.equal(request.provider, 'native')
      assert.equal(request.signal, controller.signal)
      assert.equal(request.messages[0].source.replayState.blocks[0].thinkingSignature, 'reasoning_content')
      yield { type: 'finish', reason: { kind: 'stop' }, replayState: {
        response: { kind: 'pi-ai', version: 2, api: 'openai-completions', provider: 'native', model }, blocks: [],
      } }
    }, () => { throw new Error('Wrong transport') })) chunks.push(chunk)
    assert.equal(calls, 1)
    assert.equal(chunks[0].replayState.response.provider, 'bridge')
    assert.equal(JSON.stringify(input), before)
    console.log('Relocated archive: compiled replay, provider defaults, single dispatch, cancellation and immutable history passed.')
  `], { cwd: installed, encoding: 'utf8' })
  assert.match(output, /Relocated archive:/)
  process.stdout.write(output)
} finally {
  await rm(root, { recursive: true, force: true })
}
