/** Real native rc.2 sessions, local fixed responses and a real durable research ledger. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
const cliRoot = process.env.FQ_NATIVE_TEST_CLI_ROOT || fileURLToPath(new URL('..', import.meta.url));
const { createNativeResearchCoordinator } = await import(pathToFileURL(join(cliRoot, 'lib/types/dsh-adapter/project-coordination.js')).href);
const { createWorkbenchTools } = await import(pathToFileURL(join(cliRoot, 'lib/types/dsh-adapter/workbench-tools.js')).href);

if (!process.env.FQ_NATIVE_TEST_MODULES) throw new Error('Set FQ_NATIVE_TEST_MODULES to an isolated rc.2 node_modules directory.');
const requireNative = createRequire(join(process.env.FQ_NATIVE_TEST_MODULES, '..', 'package.json'));
const load = async name => import(pathToFileURL(requireNative.resolve(name)).href);
assert.equal(requireNative('@deepseek-ai/dsh-agent/package.json').version, '0.2.1-rc.2');
const { Context } = await load('@deepseek-ai/cordis');
const { default: AgentLoop } = await load('@deepseek-ai/dsh-agent-loop');
const { mountAgentLoopTestDependencies } = await load('@deepseek-ai/dsh-agent-loop-testkit');
const { LlmAdapter } = await load('@deepseek-ai/dsh-llm');
const { SessionId } = await load('@deepseek-ai/dsh-session');
const Persistence = await load('@deepseek-ai/dsh-session-persistence-jsonl');
const { default: Subagents } = await load('@deepseek-ai/dsh-subagent');
const Spawn = await load('@deepseek-ai/dsh-subagent-spawn-in-process');
const { default: SessionQueryEngine } = await load('@deepseek-ai/dsh-session-query');
class Query extends SessionQueryEngine {
  async searchSessions() { throw new Error('Search is outside acceptance scope.'); }
  async searchEvents() { throw new Error('Search is outside acceptance scope.'); }
}
const root = await realpath(await mkdtemp(join(tmpdir(), 'fq-native-research-')));
const fixturePath = fileURLToPath(new URL('../../../packages/quantum-workspace/scripts/research-coordination-fixture.py', import.meta.url));
const drafts = join(root, 'drafts.json');
const original = JSON.stringify({ chat: 'Keep my question', editor: 'unsaved = True' });
await writeFile(drafts, original);
let python;
let reader;
let queue = Promise.resolve();
function startLedger() {
  python = spawn('python3', [fixturePath, join(root, 'research')], { stdio: ['pipe', 'pipe', 'inherit'] });
  reader = createInterface({ input: python.stdout })[Symbol.asyncIterator]();
}
async function stopLedger() {
  const child = python;
  const closed = new Promise(resolve => child.once('exit', resolve));
  child.stdin.end();
  await closed;
}
function action(operation, data) {
  const work = queue.then(async () => {
    python.stdin.write(JSON.stringify({ operation, data }) + '\n');
    const line = await reader.next();
    if (line.done) throw new Error('Local research ledger stopped.');
    const reply = JSON.parse(line.value);
    if (reply.error) throw new Error(reply.error);
    return reply.result;
  });
  queue = work.catch(() => {});
  return work;
}
const until = async predicate => {
  const deadline = Date.now() + 10000;
  while (!await predicate()) {
    if (Date.now() > deadline) throw new Error('Native acceptance timed out.');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
};
const gate = Promise.withResolvers();
let ctx;
let requests;
let parent;
let tools;
let loseSettlement = true;
async function mount(resume = false) {
  requests = [];
  class LocalAdapter extends LlmAdapter {
    async resolveModel(provider, model) { return { provider, id: model, name: model }; }
    async *stream(options) {
      requests.push(options);
      if (options.sessionId !== 'native-parent') await gate.promise;
      const text = 'Local fixed response. This tests coordination, not research quality.';
      yield* [{ type: 'block-start', index: 0, blockType: 'text' },
        { type: 'text-delta', index: 0, text }, { type: 'block-end', index: 0, block: { type: 'text', text } },
        { type: 'finish', reason: { kind: 'stop' } }];
    }
  }
  ctx = new Context();
  await mountAgentLoopTestDependencies(ctx, { workingDirectory: true });
  await ctx.plugin(Persistence, { root: join(root, 'sessions'), compression: 'none' });
  await ctx.plugin(AgentLoop, { agents: [] });
  ctx.llm.registerAdapter(['local-test'], new LocalAdapter());
  await ctx.plugin(Query);
  await ctx.plugin(Subagents, {});
  await ctx.plugin(Spawn, { providerName: 'spawn' });
  ({ agent: parent } = resume ? await ctx.agents.resume({ resumeSessionId: SessionId('native-parent'), agentOptions: { provider: 'local-test', model: 'fixed' } })
    : await ctx.agents.create({ sessionId: SessionId('native-parent'), meta: { cwd: root }, agentOptions: { provider: 'local-test', model: 'fixed' } }));
  const native = createNativeResearchCoordinator(parent.ctx, parent);
  tools = createWorkbenchTools(() => ({ port: 1, client: 'test-client', session: 'native-parent' }), root,
    async (url, init) => {
      if (url.endsWith('/api/agent')) return new Response(JSON.stringify({ cwd: root }));
      const { operation, port, client, session, ...data } = JSON.parse(init.body);
      if (loseSettlement && data.action === 'observe' && data.task_id === 'cost' && data.status === 'completed') {
        loseSettlement = false;
        throw new Error('Fixture: process lost the metadata completion receipt.');
      }
      return new Response(JSON.stringify(await action(operation, data)), { headers: { 'Content-Type': 'application/json' } });
    }, native);
}
const control = input => tools.find(tool => tool.name === 'workbench_research_team').execute(input, { signal: new AbortController().signal });
let summary;
try {
  startLedger();
  await mount();
  await control({ action: 'open', constraints: 'At most 64 qubits; preserve baseline.', request_id: 'open' });
  const source = await action('research.inspect', {});
  for (const task_id of ['width', 'cost']) await control({ action: 'reserve', task_id, task: `Research ${task_id}`,
    parent_run_id: source.parent, source_sha256: source.source_sha256, expected_project_revision: source.project_revision,
    expected_constraint_revision: 1, request_id: `reserve-${task_id}` });
  await Promise.all(['width', 'cost'].map(task_id => control({ action: 'dispatch', task_id })));
  await until(() => requests.filter(request => request.sessionId !== 'native-parent').length === 2);
  const running = (await control({ action: 'inspect' })).coordination;
  assert.deepEqual(Object.values(running.tasks).map(task => task.status), ['running', 'running']);
  assert.ok(requests.filter(request => request.sessionId !== 'native-parent').every(request => JSON.stringify(request.messages).includes(source.source_sha256)));
  gate.resolve();
  await until(async () => !loseSettlement && (await control({ action: 'inspect' })).coordination.tasks.width.status === 'completed');
  await parent.whenIdle();
  await control({ action: 'evidence', task_id: 'width', run_id: source.parent, source_sha256: source.source_sha256, request_id: 'link-report' });
  await queue;
  await ctx.fiber.dispose();
  await stopLedger();
  startLedger();
  await mount(true);
  await control({ action: 'recover' });
  await Promise.all(['width', 'cost'].map(task_id => control({ action: 'dispatch', task_id })));
  assert.equal(requests.length, 0, 'Recovery must not wake any model or redispatch a worker.');
  const restored = (await control({ action: 'inspect' })).coordination;
  assert.equal(restored.tasks.cost.status, 'completed', JSON.stringify(restored.tasks.cost.events));
  assert.deepEqual(Object.values(restored.tasks).map(task => task.status), ['completed', 'completed']);
  assert.equal(restored.tasks.width.worker_session_id, running.tasks.width.worker_session_id);
  assert.equal(restored.tasks.width.evidence.length, 1);
  const requestCount = requests.length;
  const changed = await control({ action: 'constraints', constraints: 'At most 48 qubits.', expected_constraint_revision: 1, request_id: 'revise' });
  const plan = Object.values(changed.coordination.adjustment_plans).find(plan => plan.status === 'proposed');
  assert.equal(plan.changes.length, 2);
  assert.equal(Object.keys(changed.coordination.tasks).length, 2, 'Suggestions must not create new native tasks before user review.');
  assert.equal(requests.length, requestCount);
  const confirmation = { action: 'confirm_plan', plan_id: plan.id, plan_sha256: plan.sha256,
    expected_constraint_revision: 2, request_id: 'user-confirm-plan' };
  await assert.rejects(control(confirmation), /explicit user review/);
  const confirmed = await action('research.user_review', confirmation);
  await action('research.user_review', confirmation);
  const nextIds = plan.changes.map(change => change.task_id);
  assert.equal(Object.keys(confirmed.coordination.tasks).length, 4);
  assert.equal(requests.length, requestCount, 'User confirmation must not wake a model.');
  for (const id of nextIds) assert.equal(confirmed.coordination.tasks[id].evidence.length, 0);
  await Promise.all(nextIds.map(task_id => control({ action: 'dispatch', task_id })));
  await until(async () => {
    const current = (await control({ action: 'inspect' })).coordination;
    return nextIds.every(id => current.tasks[id].status === 'completed');
  });
  await parent.whenIdle();
  assert.equal(requests.filter(request => request.sessionId !== 'native-parent').length, 2);
  assert.ok(requests.filter(request => request.sessionId !== 'native-parent').every(request => {
    const text = JSON.stringify(request.messages);
    return text.includes('At most 48 qubits.') && text.includes('task_version');
  }));
  await assert.rejects(control({ action: 'evidence', task_id: nextIds[0], run_id: source.parent,
    source_sha256: source.source_sha256, request_id: 'historical-report-reuse' }), /Earlier evidence remains historical/);
  const iterated = (await control({ action: 'inspect' })).coordination;
  assert.deepEqual(iterated.tasks.width.evidence, restored.tasks.width.evidence.map(item => ({ ...item, constraints_current: false })));
  assert.ok(nextIds.every(id => !Object.values(running.tasks).some(old => old.worker_session_id === iterated.tasks[id].worker_session_id)));
  await queue;
  await ctx.fiber.dispose();
  await stopLedger();
  startLedger();
  await mount(true);
  await control({ action: 'recover' });
  await Promise.all(nextIds.map(task_id => control({ action: 'dispatch', task_id })));
  assert.equal(requests.length, 0, 'Restart after human-confirmed iteration must not resubmit the new versions.');
  const final = (await control({ action: 'inspect' })).coordination;
  assert.equal(Object.keys(final.tasks).length, 4);
  assert.equal(final.adjustment_plans[plan.id].status, 'confirmed');
  await assert.rejects(control({ action: 'evidence', task_id: 'width', run_id: source.parent,
    source_sha256: source.source_sha256, request_id: 'stale-report' }), /constraints changed/);
  assert.equal(await readFile(drafts, 'utf8'), original);
  summary = { native_runtime: '0.2.1-rc.2', workers: 2, paid_model_calls: 0,
    ...(process.env.FQ_COORDINATION_KEEP_ROOT === '1' ? { acceptance_workspace: root } : {}),
    restart_model_requests: requests.length, worker_ids_preserved: true,
    evidence_restored: true, lost_completion_recovered_from_native_log: true,
    stale_evidence_rejected: true, fixture_drafts_preserved: true,
    constraint_adjustment: { initial_workers: 2, new_task_versions: 2,
      confirmation_did_not_execute: true, native_tool_cannot_confirm: true,
      previous_evidence_retained: true, historical_evidence_not_relabelled: true,
      new_workers_executed_with_revised_constraints: true, confirmed_versions_restored_without_dispatch: true },
    scope: 'Native sessions and durable metadata with local fixed responses and fixture verifier reports; not scientific or autonomous research acceptance.' };
  if (process.env.FQ_COORDINATION_REPORT) await writeFile(process.env.FQ_COORDINATION_REPORT, JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify(summary, null, 2));
} finally {
  gate.resolve();
  if (ctx) await ctx.fiber.dispose();
  await queue;
  if (python && python.exitCode === null) await stopLedger();
  if (process.env.FQ_COORDINATION_KEEP_ROOT !== '1') await rm(root, { recursive: true, force: true });
}
