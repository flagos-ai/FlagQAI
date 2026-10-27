import { createTwoFilesPatch } from 'diff'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type { ChatRow, ToolFileDiff } from '../adapter/ports/channel-view.js'

export interface FileChangeReview {
  id: string
  callId: string
  path: string
  change: 'add' | 'delete' | 'update' | 'unknown'
  movePath?: string
  patch?: string
  after?: string
  unavailable?: string
}

/** Read-only presentation of successful tool receipts, never working-tree attribution. */
export function createFileChangeReview(cwd: string) {
  const cache = new WeakMap<ToolFileDiff, Omit<FileChangeReview, 'id' | 'callId'> | null>()
  let priorSources: unknown[] = []
  let priorResult: { changes: FileChangeReview[]; omitted: number } | undefined
  const localPath = (file: string) => {
    const local = relative(resolve(cwd), resolve(cwd, file))
    if (!local || local === '..' || local.startsWith(`..${sep}`) || isAbsolute(local)) return undefined
    if (local.split(sep).some(part => part === '.git' || part === '.env' || part.startsWith('.env.'))) return undefined
    return local
  }
  const normalize = (diff: ToolFileDiff) => {
    if (cache.has(diff)) return cache.get(diff)
    const path = localPath(diff.path)
    const movePath = 'movePath' in diff && diff.movePath ? localPath(diff.movePath) : undefined
    if (!path || ('movePath' in diff && diff.movePath && !movePath)) { cache.set(diff, null); return null }
    let result: Omit<FileChangeReview, 'id' | 'callId'>
    if ('patch' in diff) {
      result = { path, movePath, change: diff.change ?? 'update', ...(diff.patch.length <= 32_000
        ? { patch: diff.patch } : { unavailable: 'Patch exceeds the review limit. Inspect the backend record locally.' }) }
    } else if (diff.oldText === null) {
      result = { path, change: 'unknown', after: diff.newText.slice(0, 32_000), unavailable: 'No before-image was recorded; creation cannot be confirmed.' }
      if (diff.newText.length > 32_000) result.unavailable += ' After-image truncated.'
    } else if (diff.oldText.length + diff.newText.length > 64_000) {
      result = { path, change: 'update', unavailable: 'Before/after images exceed the review limit. Inspect the backend record locally.' }
    } else {
      const patch = createTwoFilesPatch(path, path, diff.oldText, diff.newText, 'Before tool', 'After tool', { context: 3, timeout: 50 })
      result = { path, change: 'update', ...(patch !== undefined && patch.length <= 32_000
        ? { patch } : { unavailable: 'Diff exceeds the review budget. Inspect the backend record locally.' }) }
    }
    cache.set(diff, result)
    return result
  }
  return (rows: readonly ChatRow[]) => {
    const changes: FileChangeReview[] = []
    const sources: unknown[] = []
    // Match the bounded transcript window and bound the extra wire payload.
    let remaining = 256_000
    let omitted = 0
    for (const row of rows) {
      if (row.kind !== 'tool' || row.tool?.status !== 'ok' || row.tool.resultView?.card !== 'diff') continue
      for (const [index, diff] of row.tool.resultView.diffs.entries()) {
        const item = normalize(diff)
        if (!item) { omitted++; continue }
        const bytes = JSON.stringify(item).length
        if (changes.length >= 100 || bytes > remaining) { omitted++; continue }
        remaining -= bytes
        sources.push(row.tool.callId, index, item)
        changes.push({ ...item, id: `${row.tool.callId}:${index}`, callId: row.tool.callId })
      }
    }
    if (priorResult && priorResult.omitted === omitted && sources.length === priorSources.length && sources.every((item, index) => item === priorSources[index])) return priorResult
    priorSources = sources
    priorResult = { changes, omitted }
    return priorResult
  }
}
