/** Research metadata adapter. Native Harness owns worker admission and execution. */
export function createProjectCoordinator(native) {
  const pending = new Map();
  async function control(input, action, signal) {
    signal.throwIfAborted();
    const inspect = () => action('research.coordinate', { action: 'inspect', project_id: input.project_id }, signal);
    if (input.action !== 'dispatch' && input.action !== 'recover')
      return action('research.coordinate', input, signal);
    if (!native.available()) throw new Error('Native project workers are unavailable in this Harness composition.');
    const state = (await inspect()).coordination;
    if (!state || state.coordinator_session_id !== native.sessionId)
      throw new Error('Project coordination belongs to another native session.');
    if (input.action === 'recover') {
      // Observe persisted children only. Recovery must never wake a model or launch work.
      for (const task of Object.values(state.tasks)) {
        if (task.status === 'reserved') continue;
        const observed = await native.observe(task.worker_session_id, signal);
        await action('research.coordinate', { action: 'observe', project_id: input.project_id,
          task_id: task.id, worker_session_id: task.worker_session_id,
          request_id: `recover-${task.worker_session_id}-${observed.revision}`, ...observed }, signal);
      }
      return inspect();
    }
    const task = state.tasks[input.task_id];
    if (!task) throw new Error('Unknown project task.');
    const key = task.worker_session_id;
    if (pending.has(key)) return pending.get(key);
    const work = (async () => {
      const claim = await action('research.coordinate', { action: 'claim', project_id: input.project_id,
        task_id: task.id, request_id: `dispatch-${key}` }, signal);
      if (!claim.claimed) return inspect();
      signal.throwIfAborted();
      // The durable claim precedes native admission. An uncertain error is not retried.
      const prompt = JSON.stringify({ task: task.task, constraints: task.constraints,
        constraint_revision: task.constraint_revision, parent_run_id: task.parent_run_id,
        source_sha256: task.source_sha256, project_revision: task.project_revision,
        verifier_sha256: task.verifier_sha256,
        task_version: task.task_version ?? 1, previous_task_id: task.previous_task_id,
        adjustment_plan_id: task.adjustment_plan_id,
        historical_evidence: (state.adjustment_plans?.[task.adjustment_plan_id]?.changes.find(change => change.task_id === task.id)?.previous_evidence
          ?? state.tasks[task.previous_task_id]?.evidence ?? []).map(e => ({
          run_id: e.run_id, source_sha256: e.source_sha256, report_sha256: e.report_sha256,
          constraint_revision: e.constraint_revision,
        })),
        instruction: 'Preserve the baseline and drafts. Earlier evidence is historical, not verification under revised constraints. Return exact code paths and evidence IDs. Do not adopt or claim validation without an archived verifier report.' });
      const activation = await native.start(task.worker_session_id, task.id, prompt, signal);
      if (activation.childId !== task.worker_session_id) throw new Error('Native worker identity mismatch.');
      // Native parent delivery handles result notification. This callback is only a metadata projection.
      void activation.result.then(async result => {
        await action('research.coordinate', { action: 'observe', project_id: input.project_id,
          task_id: task.id, worker_session_id: task.worker_session_id,
          request_id: `settled-${key}`, status: result.stopReason === 'completed' ? 'completed' : 'failed',
          detail: JSON.stringify(result).slice(0, 4096) }, native.signal);
      }).catch(native.onError);
      await action('research.coordinate', { action: 'observe', project_id: input.project_id,
        task_id: task.id, worker_session_id: task.worker_session_id,
        request_id: `accepted-${key}`, status: 'running' }, signal);
      return inspect();
    })().finally(() => pending.delete(key));
    pending.set(key, work);
    return work;
  }
  return { control };
}
