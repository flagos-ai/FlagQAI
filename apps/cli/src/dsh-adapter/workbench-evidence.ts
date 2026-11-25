/** Compact, explicitly bounded projections of authoritative workbench records. */
type Data = Record<string, unknown>
const object = (value: unknown): Data => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Data : {}
const pick = (value: unknown, keys: string[]) => {
  const data = object(value)
  return Object.fromEntries(keys.filter(key => data[key] !== undefined).map(key => [key, data[key]]))
}
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : []

export function runSettled(run: Data): boolean {
  return ['completed', 'failed', 'cancelled', 'timed_out'].includes(String(run.status)) &&
    ['completed', 'partial', 'failed', 'cancelled'].includes(String(run.collection_status))
}

/** Keep explicit causes visible even when the recent log tail drops their frames. */
function failureEvidence(run: Data, logs: unknown[]) {
  if (run.status !== 'failed' && run.execution_status !== 'failed') return null
  const text = logs.filter(entry => object(entry).stream === 'stderr').map(entry => String(object(entry).text ?? '')).join('')
  const sections = text.split(/The above exception was the direct cause of the following exception:/)
  const last = sections.at(-1) ?? ''
  const error = (section: string) => [...section.matchAll(/^([\w.]+(?:Error|Exception)|KeyboardInterrupt|SystemExit):[^\n]*/gm)].at(-1)?.[0]?.slice(0, 1000) ?? null
  const outer = error(last)
  const wrapped = sections.length > 1 && outer?.startsWith('flagquantum.errors.ExecutionError:') &&
    /static circuit topology|[Mm]odule forward execution failed/.test(outer)
  const cause = wrapped ? sections.at(-2)! : last
  const frames = [...cause.matchAll(/File "([^"\n]+)", line (\d+)/g)].slice(-8)
  return { summary: error(cause) ?? outer, outer_error: outer,
    explicit_cause: Boolean(wrapped), frames: frames.map(frame => ({ file: frame[1], line: Number(frame[2]) })),
    guidance: 'Read detail=full before repairing. Retain the failed source and create an independent corrected version.' }
}

export function runEvidence(run: Data) {
  const logs = array(run.logs)
  let remaining = 8000
  const recent = logs.slice(-20).reverse().map(value => {
    const entry = object(value), text = String(entry.text ?? '')
    const tail = remaining ? text.slice(-remaining) : ''
    remaining = Math.max(0, remaining - tail.length)
    return { stream: entry.stream ?? 'unknown', text: tail }
  }).reverse()
  return {
    ...pick(run, ['id', 'name', 'status', 'source_hash', 'execution_status', 'collection_status', 'collection_errors', 'experiments', 'runtime', 'exit_code', 'elapsed_seconds', 'error', 'truncated', 'project']),
    settled: runSettled(run),
    failure: failureEvidence(run, logs),
    logs: recent,
    logs_truncated: logs.length > 20 || logs.reduce((sum: number, entry) => sum + String(object(entry).text ?? '').length, 0) > 8000,
    full_record: 'Use workbench_inspect(resource="run", id=run_id, detail="full") for the exact source, complete retained logs and legacy inline artifacts. Waiting never submits another run.',
  }
}

export function experimentEvidence(record: Data, port: number) {
  const program = object(record.program), job = object(record.job)
  const archive = object(program.experiment), compiled = object(program.compiled)
  const instructions = array(compiled.instructions), measurements = array(archive.measurements)
  const state = object(archive.state), values = array(state.values)
  return {
    id: record.id ?? null, name: program.name ?? null, has_result: !!record.job,
    archive: {
      ...pick(archive, ['filename', 'sha256', 'producer_version', 'program_hash']),
      download_url: `http://127.0.0.1:${port}/api/experiments/${encodeURIComponent(String(record.id))}/file`,
      format: '.fqx is a ZIP experiment archive, not plain JSON. This record was loaded by the SDK from the saved archive.',
      storage: 'The original filename is retained in this record; collected storage may use an immutable ID. Use the download URL rather than searching or copying temporary files unless requested.',
    },
    origin: pick(program.origin, ['language', 'run_id', 'source_hash', 'execution_status', 'project']),
    circuit: { ...pick(compiled, ['version', 'qubits', 'depth', 'gate_counts', 'measurement_qubits']), instructions: instructions.slice(0, 128), instruction_count: instructions.length, instructions_truncated: instructions.length > 128 },
    status: job.status ?? null,
    measurements: measurements.slice(0, 8).map(value => {
      const m = object(value), batches = array(m.batches)
      return {
        ...pick(m, ['kind', 'qubits', 'shots', 'metadata']),
        batches: batches.slice(0, 4).map((batch, index) => {
          const rows = array(batch)
          return { index, rows: rows.slice(0, 64), observed_states_total: rows.length, total_counts: rows.reduce((sum: number, row) => sum + Number(object(row).count || 0), 0), truncated: rows.length > 64 }
        }),
        batches_total: batches.length, batches_truncated: batches.length > 4,
        value_available: m.value !== undefined, statistics_available: m.statistics !== undefined,
        ...(m.value === undefined ? {} : { value: JSON.stringify(m.value).length <= 4096 ? m.value : { truncated: true, reason: 'Large recorded value; request detail=full.' } }),
      }
    }),
    measurement_count: measurements.length, measurements_truncated: measurements.length > 8,
    recorded_state: archive.state == null ? null : { ...pick(state, ['dtype', 'shape', 'complex']), values: values.slice(0, 32), truncated: state.truncated === true || values.length > 32 },
    recorded_metrics: archive.metrics == null ? null : JSON.stringify(archive.metrics).length <= 12000
      ? archive.metrics : { truncated: true, reason: 'Recorded metrics exceed the summary limit; request detail=full.' },
    metrics_status: archive.metrics == null ? 'not_recorded' : 'recorded_not_independently_verified',
    accuracy: archive.accuracy ?? null, runtime: archive.runtime ?? null, provenance: archive.provenance ?? null,
    configuration: pick(object(archive.execution_plan).resolved_options, ['backend', 'device', 'precision', 'mode', 'shots', 'seed', 'allow_backend_fallback']),
    full_record: 'Use workbench_inspect(resource="experiment", id=experiment_id, detail="full") for all previewed measurements, values, statistics, source and execution-plan fields. The original archive retains data beyond Web preview limits. Counts alone do not establish phase or fidelity.',
  }
}

export function researchEvidence(record: Data) {
  const project = object(record.project), baseline = object(project.baseline)
  const exports = array(record.exports)
  return {
    ...pick(record, ['id', 'status', 'source_sha256', 'is_project_baseline', 'comparison', 'current_comparison']),
    ...Object.fromEntries(['title', 'summary', 'error'].filter(key => record[key] !== undefined).map(key => [key, typeof record[key] === 'string' ? (record[key] as string).slice(0, 4000) : record[key]])),
    text_truncated: ['title', 'summary', 'error'].some(key => typeof record[key] === 'string' && (record[key] as string).length > 4000),
    project: { ...pick(project, ['id', 'name']), baseline: {
      ...pick(baseline, ['revision']), current: baseline.current == null ? null : pick(baseline.current, ['run_id', 'source_sha256', 'circuit_sha256', 'report_sha256']), history_count: array(baseline.history).length,
    } },
    exports: exports.slice(0, 32).map(item => pick(item, ['name', 'label', 'sha256'])),
    exports_truncated: exports.length > 32,
    full_record: 'Use workbench_inspect(resource="research_run", id=run_id, detail="full") for recorded evidence and task history. Saved status and metrics are evidence; task completion alone is not scientific validation.',
  }
}
