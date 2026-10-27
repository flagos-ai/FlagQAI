/**
 * Package-owned invariant companion for `@flagqai/cli`.
 *
 * The vendored renderer core is third-party code written against
 * looser compiler flags; the relaxed `tsconfig` options exist only for that
 * subtree and must not spread to new code.
 * @module @flagqai/cli/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller, InvariantRegistry } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@flagqai/cli'

/** Cordis companion plugin name. */
export const name = 'flagqai-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this interactive TUI front door owns no independent
 * lifecycle stream; state relations are owned by the agent/session seams it
 * renders.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
// Keep the service requirement explicit across Cordis package type copies.
export const apply = (ctx: Context & { invariants: Pick<InvariantRegistry, 'register'> }): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
