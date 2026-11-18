/** Real native sessions from an extracted CLI archive, using local fixed responses. */
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packFlagqai } from './pack-flagqai.mjs';

if (!process.env.FQ_NATIVE_TEST_MODULES) throw new Error('Set FQ_NATIVE_TEST_MODULES to the isolated native acceptance node_modules.');
const root = await mkdtemp(join(tmpdir(), 'flagqai-installed-native-coordination-'));
try {
  const archive = await packFlagqai({ destination: root });
  const relocated = join(root, 'relocated');
  await mkdir(relocated);
  execFileSync('tar', ['-xzf', archive.path, '-C', relocated]);
  await symlink(resolve(process.env.FQ_NATIVE_TEST_MODULES), join(relocated, 'node_modules'), 'dir');
  execFileSync(process.execPath, [fileURLToPath(new URL('./verify-native-project-coordination.mjs', import.meta.url))], {
    cwd: relocated, env: { ...process.env, FQ_NATIVE_TEST_CLI_ROOT: join(relocated, 'package') },
    stdio: 'inherit', timeout: 60000,
  });
} finally {
  await rm(root, { recursive: true, force: true });
}
