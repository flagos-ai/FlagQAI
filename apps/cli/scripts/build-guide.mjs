#!/usr/bin/env node
/**
 * build-guide.mjs — render the packaged guide from docs/.
 *
 * 用法：
 *   node scripts/build-guide.mjs          # 复制/刷新，打印每个写入的文件
 *   node scripts/build-guide.mjs --check  # 只比较：有漂移 exit 2（CI 走 verify-guide.mjs）
 *
 * Preserve the body while rewriting links outside the package. CI hashes the
 * rendered result; remove stray Markdown files but never edit the handwritten
 * SKILL.md index. The manifest lives in scripts/guide-sources.mjs.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { GUIDE_DIR, guideDrift, guideFiles, renderGuidePage, repoRoot } from './guide-sources.mjs'

const check = process.argv.includes('--check')
const dir = join(repoRoot, GUIDE_DIR)
const { missingSource, missingCopy, differing, extra } = guideDrift(repoRoot)

if (missingSource.length > 0) {
  console.error(`[guide] docs/ 缺少真源：${missingSource.join(', ')}`)
  process.exit(1)
}

const pending = [...missingCopy, ...differing]
if (check) {
  if (pending.length > 0) {
    console.error(`[guide] 副本与 docs/ 不一致（跑 node scripts/build-guide.mjs）：${pending.join(', ')}`)
  }
  if (extra.length > 0) {
    console.error(`[guide] 技能目录里有清单外的残留：${extra.join(', ')}`)
  }
  if (pending.length > 0 || extra.length > 0) process.exit(2)
  console.log(`[guide] OK: ${guideFiles().length} files match rendered docs/`)
  process.exit(0)
}

mkdirSync(dir, { recursive: true })
for (const file of pending) {
  writeFileSync(join(dir, file), renderGuidePage(repoRoot, file))
  console.log(`[guide] ${missingCopy.includes(file) ? 'add   ' : 'update'} ${GUIDE_DIR}/${file}`)
}
for (const file of extra) {
  rmSync(join(dir, file), { force: true })
  console.log(`[guide] remove ${GUIDE_DIR}/${file}`)
}
if (pending.length === 0 && extra.length === 0) {
  console.log(`[guide] 已是最新：${guideFiles().length} 个文件`)
}
