/** Local, privacy-safe evidence of decisions accepted by the HTTP host.
 * Harness remains the permission authority; this journal stores no prompts,
 * command arguments, free-text reasons, or inferred timestamps. */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const keyOf = ref => {
  if (typeof ref?.backendId !== 'string' || !ref.backendId || typeof ref.sessionId !== 'string' || !ref.sessionId) {
    throw new TypeError('A stable backend and session ID are required');
  }
  return sha256(JSON.stringify([ref.backendId, ref.sessionId]));
};
const outcomeOf = kind => kind === 'allow-once' || kind === 'allow-always' ? kind
  : kind === 'reject' ? 'rejected' : undefined;

export function createPermissionDecisionStore({ directory }) {
  if (typeof directory !== 'string' || !directory) throw new TypeError('A local evidence directory is required');
  const queues = new Map();
  const fileOf = key => join(directory, `${key}.json`);
  const locked = async (key, action) => {
    const prior = queues.get(key) ?? Promise.resolve();
    const current = prior.catch(() => undefined).then(action);
    queues.set(key, current);
    try { return await current; }
    finally { if (queues.get(key) === current) queues.delete(key); }
  };
  const load = async key => {
    let value;
    try { value = JSON.parse(await readFile(fileOf(key), 'utf8')); }
    catch (error) { if (error?.code === 'ENOENT') return undefined; throw error; }
    if (value?.schemaVersion !== 1 || value.sessionKey !== key || typeof value.complete !== 'boolean'
      || !Array.isArray(value.decisions) || value.decisions.some(row =>
        typeof row?.requestHash !== 'string' || !/^[0-9a-f]{64}$/.test(row.requestHash)
        || !['allow-once', 'allow-always', 'rejected'].includes(row.outcome)
        || !['prepared', 'committed'].includes(row.state))
      || new Set(value.decisions.map(row => row.requestHash)).size !== value.decisions.length) {
      throw new Error('Invalid local permission evidence');
    }
    return value;
  };
  const save = async (key, value) => {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = join(directory, `.${key}.${randomUUID()}.tmp`);
    const handle = await open(temporary, 'wx', 0o600);
    let closed = false;
    try {
      await handle.writeFile(JSON.stringify(value) + '\n');
      await handle.sync();
      await handle.close();
      closed = true;
      await rename(temporary, fileOf(key));
    } finally {
      if (!closed) await handle.close().catch(() => undefined);
      await unlink(temporary).catch(() => undefined);
    }
  };
  const mutate = (ref, action) => {
    const key = keyOf(ref);
    return locked(key, async () => {
      const value = await load(key);
      if (!value) throw new Error('Permission evidence was not initialized for this session');
      const result = action(value);
      await save(key, value);
      return result;
    });
  };
  return {
    sessionKey: keyOf,
    initialize(ref, { fresh }) {
      const key = keyOf(ref);
      return locked(key, async () => {
        const existing = await load(key);
        if (existing) {
          if (fresh === true) throw new Error('A new session reused an existing permission evidence identity');
          return;
        }
        await save(key, { schemaVersion: 1, sessionKey: key, complete: fresh === true, decisions: [] });
      });
    },
    prepare(ref, requestId, kind) {
      const outcome = outcomeOf(kind);
      if (typeof requestId !== 'string' || !requestId || !outcome) throw new TypeError('A permission request and decision are required');
      const requestHash = sha256(requestId);
      return mutate(ref, value => {
        if (value.decisions.some(row => row.requestHash === requestHash)) throw new Error('Permission decision already recorded');
        value.decisions.push({ requestHash, outcome, state: 'prepared' });
      });
    },
    commit(ref, requestId) {
      const requestHash = sha256(requestId);
      return mutate(ref, value => {
        const row = value.decisions.find(item => item.requestHash === requestHash);
        if (!row || row.state !== 'prepared') throw new Error('Permission decision was not prepared');
        row.state = 'committed';
      });
    },
    abort(ref, requestId) {
      const requestHash = sha256(requestId);
      return mutate(ref, value => {
        value.decisions = value.decisions.filter(row => row.requestHash !== requestHash || row.state !== 'prepared');
      });
    },
    async read(ref) {
      const key = keyOf(ref);
      return locked(key, async () => {
        try {
          const value = await load(key);
          return value && {
            sessionKey: key,
            complete: value.complete && value.decisions.every(row => row.state === 'committed'),
            decisions: value.decisions.filter(row => row.state === 'committed').map(row => ({ outcome: row.outcome })),
          };
        } catch { return undefined; } // Corruption or I/O failure means unknown, never zero.
      });
    },
  };
}
