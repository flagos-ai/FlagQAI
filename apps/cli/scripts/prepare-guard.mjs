#!/usr/bin/env node
/** Reject incomplete source snapshots before the build reaches vendored imports. */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const probe = join(process.cwd(), 'vendor', 'dsh-std', 'packages', 'core', 'package.json')
if (!existsSync(probe)) {
  console.error('[prepare-guard] vendor/dsh-std source content is missing —')
  console.error('  this is an incomplete source checkout where `npm run compile`')
  console.error('  cannot succeed (every vendored import fails to resolve).')
  console.error('  - Use a complete FlagQAI source checkout and follow')
  console.error('    apps/cli/docs/getting-started.en.md to build a local tarball.')
  console.error('      git clone https://github.com/flagos-ai/FlagQAI.git')
  process.exit(1)
}
