import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createPermissionDecisionStore } from './permission-decisions.mjs';

test('accepted decisions survive restart once, without prompt or free-text data', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flagqai-permissions-'));
  try {
    const ref = { backendId: 'dsh', sessionId: 'native-session' };
    const store = createPermissionDecisionStore({ directory: root });
    await store.initialize(ref, { fresh: true });
    assert.equal((await store.read(ref)).decisions.length, 0);
    await store.prepare(ref, 'request-secret', 'reject');
    assert.equal((await store.read(ref)).complete, false, 'an interrupted decision cannot be counted as zero');
    await store.commit(ref, 'request-secret');
    const reopened = createPermissionDecisionStore({ directory: root });
    const evidence = await reopened.read(ref);
    assert.deepEqual(evidence.decisions, [{ outcome: 'rejected' }]);
    assert.equal(evidence.complete, true);
    assert.equal(evidence.sessionKey, store.sessionKey(ref));
    await assert.rejects(reopened.initialize(ref, { fresh: true }), /reused an existing/);
    await assert.rejects(reopened.prepare(ref, 'request-secret', 'reject'), /already recorded/);
    const contents = await readFile(join(root, (await readdir(root))[0]), 'utf8');
    for (const secret of ['native-session', 'request-secret', 'command argument', 'user feedback']) {
      assert.equal(contents.includes(secret), false);
    }
    assert.equal(contents.includes('time'), false, 'the journal must not invent timestamps');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('legacy resume, aborted decisions, and corruption never produce a false zero', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flagqai-permissions-'));
  try {
    const ref = { backendId: 'dsh', sessionId: 'legacy' };
    const store = createPermissionDecisionStore({ directory: root });
    assert.equal(await store.read(ref), undefined);
    await store.initialize(ref, { fresh: false });
    assert.equal((await store.read(ref)).complete, false);
    await store.prepare(ref, 'p1', 'allow-once');
    await store.abort(ref, 'p1');
    assert.deepEqual((await store.read(ref)).decisions, []);
    assert.equal((await store.read(ref)).complete, false);
    await writeFile(join(root, `${store.sessionKey(ref)}.json`), '{invalid');
    assert.equal(await store.read(ref), undefined);
  } finally { await rm(root, { recursive: true, force: true }); }
});
