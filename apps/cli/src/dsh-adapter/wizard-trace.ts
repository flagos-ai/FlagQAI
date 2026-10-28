import { appendFileSync } from 'node:fs'

/**
 * Step trace shared by the `/provider` flow and the settings host it writes
 * through. Off unless `FLAGQAI_DEBUG_PROVIDER_WIZARD=1`.
 *
 * A wizard that neither finishes nor reports leaves nothing to read: the
 * rendered frame is the launchpad either way, and its notifications may not
 * render at all when `/provider` was opened from a screen without a
 * transcript. Recording each step names the last await that returned, which is
 * the one fact every diagnosis from a bare screen had to guess at.
 *
 * The destination is a FILE, not stderr. `Ink.patchStderr` replaces
 * `process.stderr.write` with an interceptor that forwards to the debug log
 * *and returns* — deliberately, because a stray tty write desyncs the
 * alternate-screen frame. A trace on stderr is therefore swallowed and never
 * reaches the terminal. The path comes from `FLAGQAI_PROVIDER_WIZARD_TRACE`.
 */
export function traceWizard(step: string, detail?: string): void {
  if (process.env.FLAGQAI_DEBUG_PROVIDER_WIZARD !== '1') return
  const path = process.env.FLAGQAI_PROVIDER_WIZARD_TRACE
  if (path === undefined || path === '') return
  const suffix = detail === undefined ? '' : ` ${detail}`
  try {
    appendFileSync(path, `${new Date().toISOString()} ${step}${suffix}\n`)
  } catch {
    // Tracing must never change the flow it is observing.
  }
}
