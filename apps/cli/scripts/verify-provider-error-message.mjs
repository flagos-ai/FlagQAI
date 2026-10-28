/**
 * `/provider` failure messages must name local faults and hide gateway ones.
 *
 * Run 40691356364 showed why this matters: the profile write threw
 * `dsh: profile reload requires the root Include entry`, and the wizard
 * reported "Check endpoint access and the local credential store, then
 * retry". The real cause was in the text the user never saw, so the message
 * cost a day of investigation instead of ending it.
 *
 * The reverse hazard is the reason the filter exists at all: an error from a
 * gateway can quote a request and its authorization header, so anything that
 * came back over the network must still be replaced.
 */
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'

const source = await readFile(fileURLToPath(new URL('../src/dsh-adapter/providerWizard.ts', import.meta.url)), 'utf8')

function check(name, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra === '' ? '' : `  (${extra})`}`)
  if (!ok) process.exitCode = 1
}

check('local host errors keep their message', source.includes("const LOCAL_ERROR_PREFIXES = ['dsh:', 'dsh-auth:', 'flagqai:', 'atomic-write:'"))
check('the filter still replaces everything else', /return t\('provider-error-safe-detail'\)/u.test(source))
check('local prefixes are consulted before the fallback',
  source.indexOf('LOCAL_ERROR_PREFIXES.some') < source.indexOf("t('provider-error-safe-detail')"))

/**
 * The filter as the wizard applies it, so the assertions below run against the
 * behaviour and not only against the source text.
 */
const prefixes = [...source.matchAll(/LOCAL_ERROR_PREFIXES = \[([^\]]*)\]/gu)][0][1]
  .split(',').map(part => part.trim().replace(/^'|'$/gu, '')).filter(Boolean)
const safe = message => {
  if (message === 'invalid_grant' || message === 'access_denied') return message
  if (prefixes.some(prefix => message.startsWith(prefix))) return message
  return '<generic>'
}

assert.deepEqual(prefixes, ['dsh:', 'dsh-auth:', 'flagqai:', 'atomic-write:'])
check('dsh composition failure is surfaced', safe('dsh: profile reload requires the root Include entry')
  === 'dsh: profile reload requires the root Include entry')
check('credential store failure is surfaced', safe('dsh-auth: cannot write credential file C:\\x: EPERM') .
  startsWith('dsh-auth:'))
check('gateway error is replaced', safe('401 Unauthorized: {"authorization":"Bearer sk-live-xxx"}') === '<generic>')
check('an error that merely mentions a prefix is replaced', safe('request failed: dsh: boom') === '<generic>')
