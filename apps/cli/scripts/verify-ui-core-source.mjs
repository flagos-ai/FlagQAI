import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = new URL('../../../', import.meta.url);
const modules = ['projection', 'activity', 'history-restore', 'job-format', 'agent-messages'];
for (const name of modules) {
  const source = await readFile(new URL(`packages/ui-core/${name}.mts`, root), 'utf8');
  const runtime = new URL(`packages/ui-core/${name}.mjs`, root);
  const generated = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.ESNext },
  }).outputText;
  if (process.argv.includes('--write')) {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(runtime, generated);
  } else {
    assert.equal(await readFile(runtime, 'utf8'), generated,
      `Shared UI ${name} runtime drift: run node scripts/verify-ui-core-source.mjs --write`);
  }
}
execFileSync(process.execPath, [fileURLToPath(import.meta.resolve('typescript/bin/tsc')),
  '--noEmit', '--strict', '--target', 'es2024', '--module', 'nodenext',
  '--moduleResolution', 'nodenext', ...modules.map(name => `packages/ui-core/${name}.mts`)], { cwd: root, stdio: 'inherit' });
console.log('PASS authoritative UI-core reducer types and shipped runtime');
