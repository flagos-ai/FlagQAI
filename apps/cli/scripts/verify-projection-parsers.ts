import assert from 'node:assert/strict';
import {BACKGROUND_START_ACK, isSubagentToolName, parseJobOutputId, todoPanelItems, toolCommandOf} from '../src/dsh-adapter/channel/projection-helpers.js';

assert.equal(isSubagentToolName('task'), true);
assert.equal(isSubagentToolName('bash'), false);
assert.equal(isSubagentToolName('task_output'), false);

assert.equal(parseJobOutputId('{"job_id":"job-7"}'), 'job-7');
for (const raw of [undefined, '', '[]', 'null', '{', '{"job_id":7}', '{"job_id":"  "}']) {
  assert.equal(parseJobOutputId(raw), undefined);
}
assert.equal(toolCommandOf('{"command":"npm run build","description":"Build"}'), 'npm run build');
assert.equal(toolCommandOf('{"text":"python run.py"}'), 'python run.py');
assert.equal(toolCommandOf('{"command":"bash -lc true","text":"ignored"}'), 'bash -lc true');
for (const raw of [undefined, '{}', '[]', '{"command":42}', '{"text":"  "}', '{']) {
  assert.equal(toolCommandOf(raw), undefined);
}

assert.equal(BACKGROUND_START_ACK.exec('started background job job-7 (Build)')?.[1], 'job-7');
assert.equal(BACKGROUND_START_ACK.exec('started background job job-8\nnext line')?.[1], 'job-8');
assert.equal(BACKGROUND_START_ACK.exec('not started background job job-7'), null);
assert.equal(BACKGROUND_START_ACK.exec('output\nstarted background job job-7'), null);

assert.deepEqual(todoPanelItems({todos: []}), []);
assert.deepEqual(todoPanelItems({todos: [{content: 'Outline', status: 'in_progress', hidden: 'ignore'}]}),
  [{content: 'Outline', status: 'in_progress'}]);
for (const value of [undefined, null, [], {}, {todos: 'wrong'},
  {todos: [{content: 'valid', status: 'pending'}, {content: 42, status: 'completed'}]},
  {todos: [{content: 'invalid', status: 'unknown'}]}]) {
  assert.equal(todoPanelItems(value), undefined);
}
console.log('PASS projection parsers: task and job identity, bounded acknowledgement, whole-list Todo validation');
