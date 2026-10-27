import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, lstatSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {writeFileAtomic} from '../src/backends/shared/atomic-file.js';

const root = mkdtempSync(join(tmpdir(), 'flagqai-atomic-'));
try {
  const dir = join(root, 'private', 'channels');
  assert.equal(writeFileAtomic(dir, 'prefs.json', '{"old":true}\n'), undefined);
  assert.equal(readFileSync(join(dir, 'prefs.json'), 'utf8'), '{"old":true}\n');
  writeFileAtomic(dir, 'prefs.json', '{"new":true}\n');
  assert.equal(readFileSync(join(dir, 'prefs.json'), 'utf8'), '{"new":true}\n');
  assert.deepEqual(readdirSync(dir), ['prefs.json']);
  if (process.platform !== 'win32') {
    assert.equal(statSync(dir).mode & 0o777, 0o700);
    assert.equal(statSync(join(dir, 'prefs.json')).mode & 0o777, 0o600);
  }

  mkdirSync(join(dir, 'blocked'));
  assert.throws(() => writeFileAtomic(dir, 'blocked', 'cannot replace a directory'));
  assert.equal(statSync(join(dir, 'blocked')).isDirectory(), true);
  assert.deepEqual(readdirSync(dir).sort(), ['blocked', 'prefs.json']);
  assert.equal(readFileSync(join(dir, 'prefs.json'), 'utf8'), '{"new":true}\n');
  assert.throws(() => writeFileAtomic(dir, '../escape', 'nope'), TypeError);
  assert.equal(readFileSync(join(dir, 'prefs.json'), 'utf8'), '{"new":true}\n');

  if (process.platform !== 'win32') {
    const referent = join(root, 'referent');
    const link = join(dir, 'link');
    writeFileSync(referent, 'keep referent');
    symlinkSync(referent, link);
    writeFileAtomic(dir, 'link', 'replace link');
    assert.equal(lstatSync(link).isSymbolicLink(), false);
    assert.equal(readFileSync(link, 'utf8'), 'replace link');
    assert.equal(readFileSync(referent, 'utf8'), 'keep referent');
  }
  console.log('PASS backend atomic file: synchronous replacement, private modes, failure cleanup and symlink safety');
} finally {
  rmSync(root, {recursive: true, force: true});
}
