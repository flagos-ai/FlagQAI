import test from 'node:test'
import assert from 'node:assert/strict'
import { sourceServerOverlay, runSourceServer } from '../bin/source-runtime.js'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
test('checkout overlay replaces only the server entry while retaining managed settings and provider defaults', () => {
  const overlay = sourceServerOverlay('/source with spaces/cli', { FLAGQAI_SERVER_PORT: '4098', FLAGQAI_MODEL: 'chosen' })
  assert.deepEqual(overlay[0], { id: 'flagqai-server-host', disabled: true })
  const entry = overlay[1].insert[0]
  assert.equal(entry.name, 'file:///source%20with%20spaces/cli/lib/types/dsh-adapter/server-host.js')
  assert.deepEqual(entry.config, { host: '127.0.0.1', port: 4098, model: 'chosen' })
  assert.equal(JSON.stringify(overlay).includes('apiKey'), false)
})
test('source checkout launches its own entry via an isolated overlay without installing or replacing a profile', async () => {
  const temporary = await realpath(await mkdtemp(join(tmpdir(), 'flagqai-source-boot-test-')))
  try {
    const root = join(temporary, 'checkout/apps/cli'), project = join(temporary, 'checkout'), runtime = join(temporary, 'runtime-root')
    for (const path of [join(root, 'src/dsh-adapter'), join(root, 'lib/types/dsh-adapter'), join(project, 'packages/server'), join(runtime, 'runtime/node_modules/@deepseek-ai/dsh')]) await mkdir(path, { recursive: true })
    for (const path of [join(root, 'src/dsh-adapter/server-host.ts'), join(root, 'lib/types/dsh-adapter/server-host.js'), join(project, 'packages/server/index.mjs')]) await writeFile(path, '')
    const host = join(runtime, 'runtime/node_modules/@deepseek-ai/dsh')
    await writeFile(join(host, 'package.json'), JSON.stringify({ version: '0.2.1-rc.2', bin: { dsh: 'fake.mjs' } }))
    const result = join(temporary, 'observed.json')
    await writeFile(join(host, 'fake.mjs'), `import {readFile,writeFile} from 'node:fs/promises'; const args=process.argv.slice(2); await writeFile(process.env.OBSERVED, JSON.stringify({args,cwd:process.cwd(),home:process.env.DSH_HOME,overlay:JSON.parse(await readFile(args[3],'utf8'))}));`)
    assert.equal(await runSourceServer({ root, env: { ...process.env, FLAGQAI_CLI_RUNTIME_ROOT: runtime, FLAGQAI_SERVER_PORT: '4100', OBSERVED: result } }), true)
    const observed = JSON.parse(await readFile(result, 'utf8'))
    assert.deepEqual(observed.args.slice(0, 3), ['--profile', 'flagqai', '--patch'])
    assert.equal(observed.cwd, project)
    assert.equal(observed.home, join(runtime, 'dsh'))
    assert.equal(observed.overlay[1].insert[0].config.port, 4100)
    assert.equal((await readdir(join(project, '.flagqai'))).length, 0)
  } finally { await rm(temporary, { recursive: true, force: true }) }
})
