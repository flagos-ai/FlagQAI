import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { t } from '../i18n.js'
import { dshHomeDir } from './credentials.js'
import { homeDir } from './paths.js'

/** The same on-disk config candidates shown by `/config` and `/doctor`. */
export function configCandidateLines(): string[] {
  const lines: string[] = []
  // The bare-composition root is retained only for users who still have it.
  const legacy = join(homeDir(), '.flagqai', 'cordis.yml')
  if (existsSync(legacy)) lines.push(t('doctor-config', { candidate: legacy, state: '✓' }))
  const profile = join(dshHomeDir(), 'profiles', 'flagqai', 'cordis.patch.yml')
  lines.push(t('doctor-config', {
    candidate: profile,
    state: existsSync(profile) ? '✓' : t('doctor-config-missing'),
  }))
  return lines
}
