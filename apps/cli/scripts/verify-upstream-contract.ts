/**
 * CI gate for the upstream compatibility contract: fails when any blessed
 * official package is installed at a version other than the validated
 * release line, so a mismatched install breaks CI before user machines.
 *
 * Run via `node --import tsx/esm scripts/verify-upstream-contract.ts`.
 * The published dsh-invariants companion remains at 0.2.0-rc.2 while the
 * primary Harness cohort is 0.2.1-rc.2.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const {
  compareVersions,
  installedUpstreamLines,
  installedUpstreamVersions,
  parseUpstreamVersion,
  upstreamDrift,
  upstreamDriftSummary,
  UPSTREAM_BLESSED_PACKAGES,
  UPSTREAM_FRAMEWORK_MAJORS,
  UPSTREAM_VALIDATED_LABEL,
  UPSTREAM_VALIDATED_VERSION,
  UPSTREAM_VALIDATED_VERSIONS,
} = await import('../src/dsh-adapter/contract.js')

const alpha = parseUpstreamVersion('0.1.2-alpha.5')!
const beta = parseUpstreamVersion('0.1.2-beta.1')!
const rc = parseUpstreamVersion('0.1.2-rc.1')!
assert.deepEqual(alpha, [0, 1, 2, 'alpha', 5])
assert.deepEqual(parseUpstreamVersion('0.1.2-alpha.4'), [0, 1, 2, 'alpha', 4])
assert.deepEqual(parseUpstreamVersion('0.1.2-alpha.3'), [0, 1, 2, 'alpha', 3])
assert.ok(compareVersions(alpha, beta) < 0 && compareVersions(beta, rc) < 0)
assert.ok(compareVersions(rc, parseUpstreamVersion('0.1.1-rc.2')!) > 0)
assert.equal(parseUpstreamVersion('0.1.2'), undefined)
assert.match(UPSTREAM_VALIDATED_LABEL, /^0\.2\.1-rc\.2/u)
// The primary line must itself be a validated line. Without this, dropping
// the primary from UPSTREAM_VALIDATED_VERSIONS still passes the prefix match
// and upstreamDrift() (which inspects the INSTALLED versions, not the
// declaration), so the contract could declare a primary nobody validates.
assert.ok(
  UPSTREAM_VALIDATED_VERSIONS.includes(UPSTREAM_VALIDATED_VERSION),
  `UPSTREAM_VALIDATED_VERSION ${UPSTREAM_VALIDATED_VERSION} must be listed in UPSTREAM_VALIDATED_VERSIONS`,
)

// An alternate upstream install may be used for compatibility testing without
// changing the managed runtime or claiming that it is the validated default.
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  peerDependencies: Record<string, string>
}
const harnessPeers = Object.entries(manifest.peerDependencies)
  .filter(([name]) => name.startsWith('@deepseek-ai/dsh-'))
assert.ok(harnessPeers.length > 0, 'the plugin must declare Harness peers')
for (const [name, range] of harnessPeers) {
  assert.ok(range.split(' || ').includes('0.2.1-rc.2'), `${name} must accept the tested 0.2.1 host`)
}

const mixedVersions = Object.fromEntries(UPSTREAM_BLESSED_PACKAGES.map(packageName => [
  packageName,
  UPSTREAM_FRAMEWORK_MAJORS[packageName] === 4
    ? '4.0.1'
    : UPSTREAM_FRAMEWORK_MAJORS[packageName] === 3
      ? '3.18.1'
      : '0.1.1-rc.2',
]))
mixedVersions['@deepseek-ai/dsh-agent'] = '0.1.2-rc.1'
assert.deepEqual(installedUpstreamLines(mixedVersions), ['0.1.1-rc.2', '0.1.2-rc.1'])
assert.deepEqual(upstreamDrift(mixedVersions), [])
assert.deepEqual(upstreamDriftSummary(mixedVersions), {
  kind: 'mixed',
  versions: ['0.1.1-rc.2', '0.1.2-rc.1'],
})

const installedLines = installedUpstreamLines()
const alternateCohort = process.env.FLAGQAI_VERIFY_UPSTREAM_COHORT
if (alternateCohort !== undefined && alternateCohort !== '0.2.1-rc.2') {
  throw new Error(`unsupported alternate Harness cohort: ${alternateCohort}`)
}
function alternateCohortMismatches(installed: Readonly<Record<string, string | undefined>>, cohort: string): string[] {
  return UPSTREAM_BLESSED_PACKAGES.flatMap(packageName => {
    const frameworkMajor = UPSTREAM_FRAMEWORK_MAJORS[packageName]
    const expected = frameworkMajor === undefined
      ? packageName === '@deepseek-ai/dsh-invariants' ? '0.2.0-rc.2' : cohort
      : `major ${frameworkMajor}`
    const actual = installed[packageName]
    const matches = frameworkMajor === undefined
      ? actual === expected
      : Number((actual ?? '').split('.')[0]) === frameworkMajor
    return matches ? [] : [`${packageName}: installed=${actual ?? 'missing'}, expected=${expected}`]
  })
}
const alternateFixture = Object.fromEntries(UPSTREAM_BLESSED_PACKAGES.map(packageName => [
  packageName,
  UPSTREAM_FRAMEWORK_MAJORS[packageName] === undefined
    ? packageName === '@deepseek-ai/dsh-invariants' ? '0.2.0-rc.2' : '0.2.1-rc.2'
    : `${UPSTREAM_FRAMEWORK_MAJORS[packageName]}.0.0`,
]))
assert.deepEqual(alternateCohortMismatches(alternateFixture, '0.2.1-rc.2'), [])
assert.equal(alternateCohortMismatches({ ...alternateFixture, '@deepseek-ai/dsh-agent': '0.2.0-rc.2' }, '0.2.1-rc.2').length, 1)
assert.equal(alternateCohortMismatches({ ...alternateFixture, '@deepseek-ai/dsh-invariants': undefined }, '0.2.1-rc.2').length, 1)
assert.equal(upstreamDrift({ ...alternateFixture, '@deepseek-ai/dsh-invariants': '0.1.7-rc.2' }).length, 1,
  'a 0.2.1 host must not silently accept an older invariants companion')
// Runtime notices tolerate version-specific optional capabilities, while CI
// still requires the complete development dependency tree.
const legacyVersions: Record<string, string | undefined> = { ...mixedVersions,
  '@deepseek-ai/dsh-agent': '0.1.1-rc.2',
  '@deepseek-ai/dsh-agent-preset-registry': undefined,
  '@deepseek-ai/dsh-ptc-runtime-node': undefined,
}
assert.equal(upstreamDriftSummary(legacyVersions), undefined, 'absent optional capabilities are not a broken host')
assert.equal(upstreamDrift(legacyVersions).length, 2, 'CI must still catch missing development packages')
assert.equal(upstreamDriftSummary({ ...legacyVersions, '@deepseek-ai/dsh-agent': undefined })?.kind, 'broken',
  'missing core runtime remains broken')
assert.equal(upstreamDriftSummary({ ...legacyVersions, '@deepseek-ai/dsh-agent-preset-registry': 'invalid' })?.kind, 'broken',
  'installed but invalid optional package must still warn')
if (alternateCohort !== undefined) {
  const mismatches = alternateCohortMismatches(installedUpstreamVersions(), alternateCohort)
  if (mismatches.length > 0) {
    console.error(`Alternate Harness cohort ${alternateCohort} violated:`)
    for (const mismatch of mismatches) console.error(`  - ${mismatch}`)
    process.exit(1)
  }
  console.log(`alternate upstream contract OK (${alternateCohort}; dsh-invariants 0.2.0-rc.2)`)
} else {
  const drift = upstreamDrift()
  if (installedLines.length > 1) {
    console.error(`Upstream contract violated (mixed harness lines: ${installedLines.join(', ')})`)
  }
  if (drift.length > 0) {
    console.error(`Upstream contract violated (validated: ${UPSTREAM_VALIDATED_LABEL}):`)
    for (const entry of drift) {
      console.error(`  - ${entry.package}: installed=${entry.installed ?? 'missing'}`)
    }
  }
  if (installedLines.length > 1 || drift.length > 0) process.exit(1)
  console.log(`upstream contract OK (validated: ${UPSTREAM_VALIDATED_LABEL})`)
}
