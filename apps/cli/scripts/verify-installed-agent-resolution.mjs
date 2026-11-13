/** Offline acceptance of resume routing from a relocated CLI archive. */
import { execFileSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { packFlagqai } from './pack-flagqai.mjs'

const root = await mkdtemp(join(tmpdir(), 'flagqai-installed-resolution-'))
try {
  const archive = await packFlagqai({ destination: root })
  const relocated = join(root, 'relocated')
  await mkdir(relocated)
  execFileSync('tar', ['-xzf', archive.path, '-C', relocated])
  const script = join(relocated, 'agent-resolution.test.mjs')
  await copyFile(new URL('./agent-resolution.test.mjs', import.meta.url), script)
  execFileSync(process.execPath, ['--test', script], {
    cwd: relocated,
    env: { ...process.env, FLAGQAI_RESOLUTION_TEST_PACKAGE_ROOT: join(relocated, 'package') },
    stdio: 'inherit', timeout: 60000,
  })
} finally {
  await rm(root, { recursive: true, force: true })
}
