// Session preferences only. Native compaction still owns pressure, summaries and checkpoints.
import { lstatSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
export function validateAutoCompaction(input) {
  if (!input || typeof input.enabled !== 'boolean' || !Number.isFinite(input.thresholdRatio) || input.thresholdRatio < .5 || input.thresholdRatio > .95 || Object.keys(input).some(key => !['enabled', 'thresholdRatio'].includes(key))) throw new Error('Use enabled and a threshold between 50% and 95%.');
  return {enabled: input.enabled, thresholdRatio: input.thresholdRatio};
}
export function createCompactionPolicy({agent, service}) {
  if (typeof service?.readAutoPolicy !== 'function' || typeof service?.setAutoPolicy !== 'function') return undefined;
  const root = join(agent.session.header.cwd, '.flagqai');
  const folder = join(root, 'compaction-policies');
  const file = join(folder, encodeURIComponent(String(agent.session.id)) + '.json');
  function guard(create = false) {
    for (const path of [root, folder]) {
      if (create) mkdirSync(path, {recursive: true, mode:0o700});
      if (lstatSync(path).isSymbolicLink() || !lstatSync(path).isDirectory()) throw new Error('Compaction preference directory must be a regular directory.');
    }
  }
  try {
    guard();
    if (!lstatSync(file).isFile() || lstatSync(file).isSymbolicLink() || lstatSync(file).size > 4096) throw new Error('Invalid compaction preference file.');
    service.setAutoPolicy(agent, validateAutoCompaction(JSON.parse(readFileSync(file, 'utf8'))));
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const read = () => ({...service.readAutoPolicy(agent), scope:'session'});
  return { read, async update(input) {
    const policy = validateAutoCompaction(input);
    const prior = service.readAutoPolicy(agent);
    const temp = join(folder, '.policy-' + randomUUID());
    guard(true);
    try {
      service.setAutoPolicy(agent, policy);
      writeFileSync(temp, JSON.stringify(policy) + '\n', {mode:0o600, flag:'wx'});
      renameSync(temp, file);
    } catch (error) {
      service.setAutoPolicy(agent, prior);
      try { unlinkSync(temp); } catch { /* No temporary preference was written. */ }
      throw error;
    }
    return read();
  }};
}
