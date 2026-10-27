import assert from 'node:assert/strict';
import {basename, listFilesDeepCandidates, listPathCandidates, normalizeCwd, sessionCwdMatches} from '../src/dsh-adapter/channel/paths.js';

assert.equal(basename('C:\\repo\\src\\main.ts'), 'main.ts');
assert.equal(normalizeCwd('C:\\Repo\\src\\..\\', true), 'c:/repo');
assert.equal(normalizeCwd('\\\\server\\share\\repo\\..', true), '//server/share');
assert.equal(normalizeCwd('C:/repo/../../other', true), 'c:/other');
assert.equal(normalizeCwd('//server/share/repo/../../other', true), '//server/share/other');
assert.equal(sessionCwdMatches('/repo', '/repo/src/../other'), true);
assert.equal(sessionCwdMatches('/repo', '/repo/../other'), false);
assert.equal(sessionCwdMatches('C:/repo', 'C:/repo/../../other', true), false);
assert.equal(sessionCwdMatches('//server/share', '//server/share/repo', true), false);

const directories = new Map([
  ['/repo', [
    {name: 'build_u22', type: 'directory' as const},
    {name: 'src', type: 'directory' as const},
    {name: '..', type: 'directory' as const},
    {name: 'unsafe\nname', type: 'file' as const},
  ]],
  ['/repo/src', [
    {name: 'main.ts', type: 'file' as const},
    {name: 'nested', type: 'directory' as const},
    {name: 'link', type: 'other' as const},
  ]],
  ['/repo/src/nested', [{name: 'view.ts', type: 'file' as const}]],
  ['/repo/build_u22', [{name: 'artifact.o', type: 'file' as const}]],
]);
const visited: string[] = [];
const fs = {
  async resolve(path: string) { return {displayPath: path}; },
  async listDir(target: {displayPath: string}) {
    visited.push(target.displayPath);
    return directories.get(target.displayPath) ?? [];
  },
};

const pathMatches = await listPathCandidates(fs, '/repo', 'src\\', undefined, 10);
assert.deepEqual(pathMatches.map(item => item.path), ['src\\main.ts', 'src\\nested\\']);
assert.deepEqual(await listPathCandidates(fs, '/repo', 'src\\ma', undefined, 10)
  .then(items => items.map(item => item.path)), ['src\\main.ts']);
assert.deepEqual(await listPathCandidates(fs, '/repo', '', AbortSignal.abort(), 10), []);

visited.length = 0;
const deep = await listFilesDeepCandidates(fs, '/repo');
assert.ok(deep.some(item => item.path === 'src/main.ts'));
assert.ok(deep.some(item => item.path === 'src/nested/view.ts'));
assert.ok(!deep.some(item => item.path.includes('build_u22') || item.path.includes('unsafe')));
assert.ok(!visited.includes('/repo/build_u22'));

const controller = new AbortController();
const cancelled = {
  ...fs,
  async listDir(target: {displayPath: string}) {
    controller.abort();
    return fs.listDir(target);
  },
};
assert.deepEqual(await listFilesDeepCandidates(cancelled, '/repo', controller.signal), []);
console.log('PASS workspace paths: project boundaries, cross-platform completion, bounded scan and cancellation');
