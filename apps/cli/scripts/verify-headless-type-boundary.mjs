#!/usr/bin/env node
// Compile the headless host alone. Type-only imports must not pull the
// inherited presentation implementation into its emitted source graph.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const cli = resolve(fileURLToPath(new URL('..', import.meta.url)))
const out = mkdtempSync(join(tmpdir(), 'flagqai-headless-types-'))
try {
  const result = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'),
    '-p', join(cli, 'tsconfig.headless-source.json'), '--outDir', out, '--listEmittedFiles'], {
    cwd: cli, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  })
  assert.equal(result.status, 0, result.stderr || result.stdout || result.error?.message)
  const prefix = 'TSFILE: '
  const emitted = result.stdout.split('\n').filter(line => line.startsWith(prefix))
    .map(line => line.slice(prefix.length).trim())
  assert.ok(emitted.length > 0, 'headless source compilation emitted no files')
  const paths = emitted.map(file => {
    assert.ok(isAbsolute(file), `unexpected compiler output path: ${file}`)
    const path = relative(out, file).split(sep).join('/')
    assert.ok(!path.startsWith('../') && path !== '..', `compiler wrote outside temporary output: ${file}`)
    return path
  })
  assert.ok(paths.includes('dsh-adapter/server-host.js'), 'headless server host was not emitted')
  const forbidden = /^(?:ink|components|screens)(?:\/|$)|^(?:ui|theme)(?:\.|$)|^hooks\/useBlink(?:\.|$)/u
  for (const path of paths) assert.ok(!forbidden.test(path), `headless type graph emitted inherited TUI: ${path}`)

  const provenance = JSON.parse(readFileSync(new URL('../../../docs/releases/upstream-provenance-markers.json', import.meta.url), 'utf8'))
  const exclusions = new Set(provenance.upstreamAuditExclusions)
  const historical = provenance.entries.filter(entry => !exclusions.has(entry.path))
  assert.equal(historical.length, provenance.expectedHistoricalCcPortCount)
  const emittedSet = new Set(paths)
  for (const entry of historical) {
    const stem = entry.path.replace(/^src\//u, '').replace(/\.tsx?$/u, '')
    assert.ok(!emittedSet.has(`${stem}.js`), `headless type graph emitted historical candidate ${entry.path}`)
  }
  console.log(`PASS headless TypeScript source boundary (${paths.length} emitted modules; no inherited renderer or historical same-path candidates)`)
} finally {
  rmSync(out, {recursive: true, force: true})
}
