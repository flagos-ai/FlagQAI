#!/usr/bin/env node
/** Build FlagQAI portable archives from the current checkout. */
import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sourceRuntimeDir = join(root, 'standalone')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const version = pkg.version

if (pkg.name !== '@flagqai/cli') throw new Error(`unexpected package identity: ${pkg.name}`)
if (!existsSync(join(root, 'lib', 'types', 'index.js'))) {
  throw new Error('compiled CLI is missing; run `pnpm compile` before building portable archives')
}

const argOut = process.argv.indexOf('--out')
const outDir = resolve(argOut >= 0 ? process.argv[argOut + 1] : join(root, 'dist-standalone'))
const argTargets = process.argv.indexOf('--targets')
const defaultTargets = 'node24-linux-x64,node24-linux-arm64,node24-win-x64,node24-macos-arm64,node24-macos-x64'
const targets = argTargets >= 0 ? process.argv[argTargets + 1] : defaultTargets
const skipPkg = process.argv.includes('--skip-pkg')

const runtimeWorkspace = join(outDir, '.runtime-workspace')
const stageDir = join(outDir, '.stage')
mkdirSync(outDir, { recursive: true })
rmSync(runtimeWorkspace, { recursive: true, force: true })
rmSync(stageDir, { recursive: true, force: true })
mkdirSync(runtimeWorkspace, { recursive: true })

for (const file of [
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'entry.mjs',
  'cacheGuard.cjs',
  'pkg.config.json',
]) copyFileSync(join(sourceRuntimeDir, file), join(runtimeWorkspace, file))

const workspacePackagePath = join(runtimeWorkspace, 'package.json')
const workspaceYamlPath = join(runtimeWorkspace, 'pnpm-workspace.yaml')
const entryFile = join(runtimeWorkspace, 'entry.mjs')
const pkgConfig = join(runtimeWorkspace, 'pkg.config.json')
const runtimeTar = join(runtimeWorkspace, 'runtime.tar.gz')

function withMinimumReleaseAge(value, fn) {
  const original = readFileSync(workspaceYamlPath, 'utf8')
  const existing = /^minimumReleaseAge:.*$/m.exec(original)
  const modified = existing === null
    ? `minimumReleaseAge: ${value}\n${original}`
    : original.replace(existing[0], `minimumReleaseAge: ${value}`)
  writeFileSync(workspaceYamlPath, modified, 'utf8')
  try {
    return fn()
  } finally {
    writeFileSync(workspaceYamlPath, original, 'utf8')
  }
}

console.log('\n============================================')
console.log('  FlagQAI Standalone Bundle Builder')
console.log(`  Version: ${version}`)
console.log(`  Targets: ${targets}`)
console.log(`  Output:  ${outDir}`)
console.log('============================================\n')

try {
  console.log('==> 打包当前 @flagqai/cli 源码产物…')
  const packedName = 'flagqai-cli.tgz'
  const packedDestination = join(runtimeWorkspace, packedName)
  execFileSync(
    'pnpm',
    [
      '--config.node-linker=hoisted',
      '--config.ignore-scripts=true',
      'pack',
      '--out',
      packedDestination,
    ],
    {
      cwd: root,
      stdio: ['ignore', 'ignore', 'inherit'],
    },
  )
  if (!existsSync(packedDestination)) throw new Error('pnpm pack did not produce flagqai-cli.tgz')

  const runtimePackage = JSON.parse(readFileSync(workspacePackagePath, 'utf8'))
  runtimePackage.dependencies['@flagqai/cli'] = `file:${packedName}`
  writeFileSync(workspacePackagePath, `${JSON.stringify(runtimePackage, null, 2)}\n`, 'utf8')

  const entryContent = readFileSync(entryFile, 'utf8')
    .replace(/const TUI_VERSION = '.*?'/, `const TUI_VERSION = '${version}'`)
  writeFileSync(entryFile, entryContent, 'utf8')

  console.log('==> 解析本地 CLI tarball 并安装锁定运行时…')
  withMinimumReleaseAge(0, () => {
    execFileSync('pnpm', ['install', '--lockfile-only'], { cwd: runtimeWorkspace, stdio: 'inherit' })
  })
  execFileSync('pnpm', ['install', '--frozen-lockfile'], { cwd: runtimeWorkspace, stdio: 'inherit' })

  console.log('==> 打包 node_modules 到 runtime.tar.gz…')
  execFileSync('tar', ['-czf', runtimeTar, 'node_modules'], { cwd: runtimeWorkspace, stdio: 'inherit' })
  const tarStat = statSync(runtimeTar)
  console.log(`    [OK] runtime.tar.gz (${(tarStat.size / 1024 / 1024).toFixed(2)} MB)`)

  if (skipPkg) {
    console.log('\n[OK] --skip-pkg：本地 FlagQAI 运行时组装通过，已跳过二进制编译。')
  } else {
    mkdirSync(stageDir, { recursive: true })
    console.log(`\n==> 编译 FlagQAI 便携二进制 (${targets})…`)
    execFileSync('npx', [
      '--yes', '@yao-pkg/pkg@6.22.0', entryFile,
      '--config', pkgConfig,
      '--targets', targets,
      '--out-path', stageDir,
      '--compress', 'GZip',
      '--no-bytecode', '--public',
    ], { cwd: runtimeWorkspace, stdio: 'inherit' })

    console.log('\n==> 打包各平台 FlagQAI 便携包…')
    const targetMap = [
      { match: /^entry-linux-arm64$/i, platform: 'linux-arm64', binary: 'flagqai', format: 'tar.gz' },
      { match: /^(?:entry-linux(?:-x64)?|entry)$/i, platform: 'linux-x64', binary: 'flagqai', format: 'tar.gz' },
      { match: /^entry-win(?:-x64)?(?:\.exe)?$/i, platform: 'win-x64', binary: 'flagqai.exe', format: 'zip' },
      { match: /^entry-(?:macos|darwin)-arm64$/i, platform: 'darwin-arm64', binary: 'flagqai', format: 'tar.gz' },
      { match: /^entry-(?:macos|darwin)(?:-x64)?$/i, platform: 'darwin-x64', binary: 'flagqai', format: 'tar.gz' },
    ]

    for (const stagedFile of readdirSync(stageDir)) {
      const stagedPath = join(stageDir, stagedFile)
      if (!statSync(stagedPath).isFile()) continue
      const matched = targetMap.find(item => item.match.test(stagedFile))
      if (!matched) {
        console.warn(`    [WARN] 未知构建目标产物: ${stagedFile}，跳过打包`)
        continue
      }
      const archiveName = `flagqai-standalone-${matched.platform}.${matched.format}`
      const archivePath = join(outDir, archiveName)
      const binDir = join(stageDir, `bin-${matched.platform}`)
      rmSync(binDir, { recursive: true, force: true })
      mkdirSync(binDir, { recursive: true })
      const targetBinPath = join(binDir, matched.binary)
      copyFileSync(stagedPath, targetBinPath)
      try { chmodSync(targetBinPath, 0o755) } catch { /* Windows permissions */ }
      rmSync(archivePath, { force: true })
      if (matched.format === 'zip') {
        if (process.platform === 'win32') {
          execFileSync('tar', ['-a', '-cf', archivePath, '-C', binDir, matched.binary], { stdio: 'inherit' })
        } else {
          execFileSync('zip', ['-j', archivePath, targetBinPath], { stdio: 'inherit' })
        }
      } else {
        execFileSync('tar', ['-czf', archivePath, '-C', binDir, matched.binary], { stdio: 'inherit' })
      }
      console.log(`    [OK] ${archiveName} (${(statSync(archivePath).size / 1024 / 1024).toFixed(2)} MB)`)
    }
    console.log(`\nFlagQAI 便携包构建完成：${outDir}`)
  }
} finally {
  rmSync(runtimeWorkspace, { recursive: true, force: true })
  rmSync(stageDir, { recursive: true, force: true })
}
