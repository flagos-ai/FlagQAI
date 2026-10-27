import { compositionRoot } from '../../dsh-adapter/host-access.js'
import { parseAdapterRuntime, type AdapterRuntimeOptions } from './runtime.js'

type AdapterContext = Parameters<typeof compositionRoot>[0]

// The environment is a process-wide input, but each composition has its own
// stable decision. Child contexts must share their root's decision.
const runtimeByRoot = new WeakMap<object, AdapterRuntimeOptions>()

export function adapterRuntimeFor(ctx: AdapterContext): AdapterRuntimeOptions {
  const root = compositionRoot(ctx)
  const existing = runtimeByRoot.get(root)
  if (existing !== undefined) return existing

  const runtime = parseAdapterRuntime()
  runtimeByRoot.set(root, runtime)
  return runtime
}

/** Capture an explicit environment without affecting any composition. */
export function snapshotAdapterRuntime(env: NodeJS.ProcessEnv): AdapterRuntimeOptions {
  return parseAdapterRuntime(env)
}
