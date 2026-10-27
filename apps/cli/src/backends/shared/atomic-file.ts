import {randomUUID} from 'node:crypto';
import {closeSync, fsyncSync, mkdirSync, openSync, renameSync, unlinkSync, writeFileSync} from 'node:fs';
import {basename, join} from 'node:path';

/** Synchronously replace a private document without exposing partial content. */
export function writeFileAtomic(dir: string, file: string, text: string): void {
  if (!file || basename(file) !== file) throw new TypeError('file must be a basename');
  mkdirSync(dir, {recursive: true, mode: 0o700});

  const target = join(dir, file);
  const temporary = join(dir, `.${file}.${randomUUID()}.tmp`);
  let descriptor: number | undefined;
  let committed = false;
  try {
    descriptor = openSync(temporary, 'wx', 0o600);
    writeFileSync(descriptor, text, 'utf8');
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporary, target);
    committed = true;
  } finally {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch { /* preserve the original failure */ }
    }
    if (!committed) {
      try { unlinkSync(temporary); } catch { /* temp may not have been created */ }
    }
  }
}
