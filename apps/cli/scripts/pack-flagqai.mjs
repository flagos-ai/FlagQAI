/** Build a relocatable tarball from pnpm workspace packages; no publish action. */
import { execFileSync } from 'node:child_process'
import { access, cp, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { verifyPackageBoundary } from './package-boundary.mjs'
import { resolveNpmCli } from './npm-cli.mjs'

/** Keep a bundled package's own files but never copy its nested install tree. */
export function includeBundledEntry(packageRoot, candidate) {
  const root = packageRoot.replaceAll('\\', '/').replace(/\/+$/u, '')
  const path = candidate.replaceAll('\\', '/')
  if (path === root) return true
  if (!path.startsWith(`${root}/`)) return false
  return !path.slice(root.length + 1).split('/').includes('node_modules')
}

/** Reject emitted files left behind when a TypeScript source was deleted. */
export async function assertNoOrphanedCompiledSources(root) {
  const compiled = join(root, 'lib', 'types')
  const source = join(root, 'src')
  async function visit(directory, relative = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      const name = join(relative, entry.name)
      if (entry.isDirectory()) {
        await visit(path, name)
      } else if (entry.isFile()) {
        const suffix = ['.d.ts.map', '.js.map', '.d.ts', '.js'].find(candidate => name.endsWith(candidate))
        if (suffix === undefined) continue
        const stem = name.slice(0, -suffix.length)
        let found = false
        for (const sourceSuffix of ['.ts', '.tsx']) {
          try { await access(join(source, `${stem}${sourceSuffix}`)); found = true; break } catch { /* try the other source extension */ }
        }
        if (!found) {
          // Report the path with forward slashes on every platform. This message
          // is matched by tests and read by people, and Windows `join` yields
          // backslashes; the rest of this file normalizes separators the same way.
          throw new Error(`Stale compiled CLI module: lib/types/${name.replaceAll('\\', '/')}. Run npm run compile before packing.`)
        }
      }
    }
  }
  await visit(compiled)
}

export async function packFlagqai({ root = fileURLToPath(new URL('..', import.meta.url)), destination, env = process.env }) {
  await assertNoOrphanedCompiledSources(root)
  const out = resolve(destination)
  await mkdir(out, { recursive: true })
  const stage = await mkdtemp(join(tmpdir(), 'flagqai-package-'))
  try {
    const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
    // npm 10 runs prepare during `npm pack --ignore-scripts`. The staged
    // distribution is already compiled and intentionally omits build scripts.
    const { prepare: _sourceOnlyPrepare, ...scripts } = manifest.scripts ?? {}
    const stagedManifest = { ...manifest, scripts }
    await writeFile(join(stage, 'package.json'), JSON.stringify(stagedManifest, null, 2) + '\n')
    for (const entry of ['LICENSE', 'README.md', ...manifest.files.filter(value => !value.startsWith('!'))]) {
      await cp(join(root, entry), join(stage, entry), { recursive: true, dereference: true }).catch(error => {
        if (error.code !== 'ENOENT') throw error
        if (['LICENSE', 'bin', 'lib'].includes(entry)) throw new Error(`Missing ${entry}; install and build the CLI before packing.`)
      })
    }
    // npm can emit unsafe ../ members for pnpm workspace links. Materialize
    // only packages declared bundled; other dependencies remain registry installs.
    for (const name of manifest.bundledDependencies) {
      const packageRoot = join(root, 'node_modules', name)
      await cp(packageRoot, join(stage, 'node_modules', name), {
        recursive: true, dereference: true, filter: path => includeBundledEntry(packageRoot, path),
      })
    }
    const reports = JSON.parse(execFileSync(process.execPath, [resolveNpmCli(), 'pack', '--ignore-scripts', '--json', '--pack-destination', out], { cwd: stage, env, encoding: 'utf8' }))
    const report = reports[0]
    verifyPackageBoundary(report.files)
    if (!report.files.some(file => file.path === 'lib/types/index.js')) {
      throw new Error('CLI build is missing from package')
    }
    if (report.files.some(file => file.path.split('/').includes('..'))) throw new Error('Unsafe relative archive member')
    const filename = report.filename
    if (!filename.endsWith('.tgz')) throw new Error('npm pack returned an unexpected archive name')
    if (filename !== report.filename) await rename(join(out, report.filename), join(out, filename))
    return { ...report, filename, path: join(out, filename) }
  } finally { await rm(stage, { recursive: true, force: true }) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 4 || process.argv[2] !== '--out') {
    throw new Error('Usage: node scripts/pack-flagqai.mjs --out <directory>')
  }
  const report = await packFlagqai({ destination: process.argv[3] })
  console.log(report.path)
}
