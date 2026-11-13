/** Exercise the packaged HTTP server/SDK after relocation, without dependencies or models. */
import { execFileSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { packFlagqai } from './pack-flagqai.mjs'

const root = await mkdtemp(join(tmpdir(), 'flagqai-installed-delivery-'))
try {
  const archive = await packFlagqai({ destination: root })
  const relocated = join(root, 'relocated')
  await mkdir(relocated)
  execFileSync('tar', ['-xzf', archive.path, '-C', relocated])
  const script = join(relocated, 'message-delivery.test.mjs')
  await copyFile(new URL('./message-delivery.test.mjs', import.meta.url), script)
  execFileSync(process.execPath, ['--test', script], {
    cwd: relocated,
    env: { ...process.env, FLAGQAI_DELIVERY_TEST_PACKAGE_ROOT: join(relocated, 'package') },
    stdio: 'inherit', timeout: 120000,
  })
} finally {
  await rm(root, { recursive: true, force: true })
}
