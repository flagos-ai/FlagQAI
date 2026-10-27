#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
const read = path => readFile(new URL(path, root), 'utf8')
const manifest = JSON.parse(await read('package.json'))
const launcher = await read('bin/native-launcher.js')
const primaryBin = await read('bin/flagqai.js')
const launchpad = await read('src/screens/Launchpad.tsx')
const chat = await read('src/screens/Chat.tsx')
const standaloneBuilder = await read('scripts/make-standalone-bundle.mjs')
const standaloneEntry = await read('standalone/entry.mjs')
const standaloneManifest = JSON.parse(await read('standalone/package.json'))
const updateSource = await read('src/update.ts')

const failures = []
const expect = (condition, message) => {
  if (!condition) failures.push(message)
}
const declaredPackages = {
  ...manifest.dependencies,
  ...manifest.devDependencies,
  ...manifest.optionalDependencies,
  ...manifest.peerDependencies,
}

expect(manifest.name === '@flagqai/cli', 'package name must be @flagqai/cli')
expect(manifest.version === '0.1.0', 'initial independent CLI version must be 0.1.0')
expect(manifest.repository?.url === 'https://github.com/flagos-ai/FlagQAI.git', 'repository must point to flagos-ai/FlagQAI')
expect(manifest.repository?.directory === 'apps/cli', 'repository directory must identify apps/cli')
expect(
  declaredPackages['@deepseek-harness-tui/dsh-tui'] === undefined,
  'independent FlagQAI CLI source must not depend on @deepseek-harness-tui/dsh-tui',
)
expect(manifest.bin?.flagqai === './bin/flagqai.js', 'flagqai must be the primary command')
expect(manifest.bin?.fq === './bin/flagqai.js', 'fq must be the short command')
expect(JSON.stringify(Object.keys(manifest.bin ?? {}).sort()) === JSON.stringify(['flagqai', 'fq']), 'only flagqai and fq commands must be exposed')
expect(primaryBin.includes("await import('./native-launcher.js')"), 'primary command must delegate to the single launcher implementation')
expect(launcher.includes("const PACKAGE = '@flagqai/cli'"), 'launcher bootstrap must install @flagqai/cli')
expect(launcher.includes("const PROFILE = 'flagqai'"), 'native profile must use the FlagQAI name')
expect(launchpad.includes('`FlagQAI v${tuiVersion}`'), 'launchpad must show the FlagQAI product version')
expect(chat.includes('useTerminalTitle(chatTerminalTitle(titlePrefix, channel.sessionTitle))'), 'terminal tab must use the FlagQAI title formatter')
expect(standaloneManifest.name === 'flagqai-standalone-runtime', 'portable runtime manifest must use FlagQAI identity')
expect(standaloneManifest.dependencies?.['@flagqai/cli'] === 'file:flagqai-cli.tgz', 'portable runtime must consume the locally packed FlagQAI CLI')
expect(standaloneEntry.includes("join(runtimeRoot, 'node_modules', '@flagqai', 'cli')"), 'portable entry must launch the FlagQAI package')
expect(standaloneBuilder.includes("'pnpm',") && standaloneBuilder.includes("'pack',") && standaloneBuilder.includes("packedDestination"), 'portable builder must pack the current checkout')
expect(standaloneBuilder.includes('flagqai-standalone-${matched.platform}'), 'portable archive names must use FlagQAI identity')
expect(updateSource.includes("return 'flagqai-standalone-win-x64.zip'"), 'updater must request FlagQAI release assets')

for (const [lang, usage] of [
  ['en', 'Usage: flagqai|fq'],
  ['zh', '用法：flagqai|fq'],
]) {
  const help = spawnSync(process.execPath, [fileURLToPath(new URL('bin/flagqai.js', root)), '--help'], {
    encoding: 'utf8',
    env: { ...process.env, FLAGQAI_LANG: lang },
  })
  expect(help.status === 0, `${lang} help must work without bootstrapping a profile`)
  expect(help.stdout.includes(usage), `${lang} help must lead with FlagQAI`)
  expect(help.stdout.includes('flagqai setup') && help.stdout.includes('  setup ') && !help.stdout.includes('flagqai|dst ['), `${lang} help must show the first-run command without presenting legacy commands as primary`)
  const doctorDescription = lang === 'en'
    ? 'Check local runtime and profile readiness (no provider request)'
    : '检查本地运行环境和 profile（不请求 Provider）'
  expect(help.stdout.includes(doctorDescription), `${lang} help must describe the managed runtime check without implying a provider call`)
  expect(help.stdout.includes('FlagQAI TUI profile') && !help.stdout.includes('dsh --profile'), `${lang} help must present FlagQAI as the product with the FlagQAI profile`)
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL: ${failure}`)
  process.exit(1)
}

console.log('FlagQAI CLI identity contract OK (package, commands, launcher, profile, UI)')
