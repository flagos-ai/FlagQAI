import type { Context } from '@deepseek-ai/cordis'
import type { SessionCatalog, SessionListScope } from '../../agent/backend.js'
import { listSummaries, locateSession, previewSession, type SessionSource } from '../sessions/index.js'

const PREVIEW_ENTRIES = 8

/** Harness persistence exposed through the backend-neutral session catalog. */
export function createDshSessionCatalog(ctx: Context): SessionCatalog {
  const source = (): SessionSource | undefined => ctx.get('sessionPersistence') as SessionSource | undefined
  const list = async (scope: SessionListScope = {}) => {
    const persistence = source()
    if (persistence === undefined) return []
    const rows = await listSummaries(persistence)
    const scoped = scope.allProjects === true || scope.cwd === undefined
      ? rows
      : rows.filter(row => row.cwd === scope.cwd)
    return scoped.map(row => ({ ...row, backendId: 'dsh' }))
  }
  return {
    list,
    async info(sessionId, cwd) {
      return (await list(cwd === undefined ? { allProjects: true } : { cwd }))
        .find(row => row.id === sessionId)
    },
    async preview(sessionId, options = {}) {
      const persistence = source()
      if (persistence === undefined) return []
      const path = await locateSession(persistence, sessionId)
      if (path === undefined) return []
      return previewSession(path, options.limit ?? PREVIEW_ENTRIES)
    },
  }
}
