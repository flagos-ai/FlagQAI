/** Install a pinned test-only Harness composition; all responses are local. */
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveNpmCli } from './npm-cli.mjs';

const root = await mkdtemp(join(tmpdir(), 'flagqai-native-coordination-profile-'));
try {
  let modules = process.env.FQ_NATIVE_TEST_MODULES;
  if (!modules) {
    const profile = join(root, 'runtime');
    await mkdir(profile);
    const pins = JSON.parse(await readFile(new URL('../bin/runtime-profile-overrides.json', import.meta.url), 'utf8'));
    const names = ['dsh-agent', 'dsh-agent-loop', 'dsh-agent-loop-testkit', 'dsh-llm', 'dsh-session',
      'dsh-session-persistence-jsonl', 'dsh-subagent', 'dsh-subagent-spawn-in-process', 'dsh-session-query'];
    const dependencies = Object.fromEntries(names.map(name => ['@deepseek-ai/' + name, '0.2.1-rc.2']));
    // The native testkit's rc.2 composition declares Cordis ~4.0.5.
    dependencies['@deepseek-ai/cordis'] = '4.0.5';
    await writeFile(join(profile, 'package.json'), JSON.stringify({
      name: 'flagqai-native-coordination-acceptance', private: true, type: 'module',
      dependencies, overrides: { ...pins, '@deepseek-ai/cordis': '4.0.5' },
    }));
    execFileSync(process.execPath, [resolveNpmCli(), 'install', '--ignore-scripts', '--no-audit', '--no-fund'], {
      cwd: profile, stdio: 'inherit', timeout: 180000,
    });
    modules = join(profile, 'node_modules');
  }
  for (const name of ['verify-native-project-coordination.mjs', 'verify-installed-native-project-coordination.mjs']) {
    execFileSync(process.execPath, [fileURLToPath(new URL('./' + name, import.meta.url))], {
      env: { ...process.env, FQ_NATIVE_TEST_MODULES: modules }, stdio: 'inherit', timeout: 180000,
    });
  }
} finally {
  await rm(root, { recursive: true, force: true });
}
