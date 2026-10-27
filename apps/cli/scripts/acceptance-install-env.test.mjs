import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { acceptanceInstallEnvironment, acceptanceRegistryEnvironment } from './acceptance-install-env.mjs'

const home = mkdtempSync(join(tmpdir(), 'flagqai-acceptance-registry-'))
try {
  const forwarded = acceptanceInstallEnvironment({
    npm_config_registry: 'https://registry.npmmirror.com/',
    npm_config_replace_registry_host: 'always',
    NPM_CONFIG_USERCONFIG: '/private/credential-file',
    NPM_TOKEN: 'secret',
  })
  assert.deepEqual(forwarded, {
    npm_config_registry: 'https://registry.npmmirror.com/',
    npm_config_replace_registry_host: 'always',
  })
  const registry = execFileSync('npm', ['config', 'get', 'registry'], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, HOME: home, ...forwarded },
  }).trim()
  assert.equal(registry, 'https://registry.npmmirror.com/')
  assert.deepEqual(acceptanceRegistryEnvironment({}), {
    npm_config_registry: 'https://registry.npmjs.org/',
  })
  const upperTransport = acceptanceRegistryEnvironment({
    NPM_CONFIG_REGISTRY: 'https://registry.npmmirror.com/',
    NPM_CONFIG_REPLACE_REGISTRY_HOST: 'always',
    NPM_CONFIG_USERCONFIG: '/private/credential-file',
    NPM_TOKEN: 'secret',
  })
  assert.deepEqual(upperTransport, {
    NPM_CONFIG_REGISTRY: 'https://registry.npmmirror.com/',
    NPM_CONFIG_REPLACE_REGISTRY_HOST: 'always',
  })
  assert.equal(execFileSync('npm', ['config', 'get', 'registry'], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, HOME: home, ...upperTransport },
  }).trim(), 'https://registry.npmmirror.com/')
  console.log('PASS isolated acceptance forwards npm registry transport without npm credentials')
} finally {
  rmSync(home, { recursive: true, force: true })
}
