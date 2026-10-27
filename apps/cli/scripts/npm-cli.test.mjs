import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { resolveNpmCli } from './npm-cli.mjs'

test('finds the Windows npm JS entry without invoking npm.cmd', () => {
  const expected = 'C:\\node\\node_modules\\npm\\bin\\npm-cli.js'
  assert.equal(resolveNpmCli({
    platform: 'win32', nodePath: 'C:\\node\\node.exe',
    environment: { npm_execpath: 'C:\\node\\node_modules\\pnpm\\bin\\pnpm.cjs' },
    exists: path => path === expected,
  }), expected)
})

test('runs the installed npm CLI directly with Node on this host', () => {
  const cli = resolveNpmCli()
  const result = spawnSync(process.execPath, [cli, '--version'], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /^\d+\.\d+\.\d+/u)
})
