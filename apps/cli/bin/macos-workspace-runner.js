import { realpathSync } from 'node:fs'
import { dirname, isAbsolute } from 'node:path'
import { spawnSync } from 'node:child_process'

// dsh-sandbox-local supplies its bwrap dialect to custom runners. Accept only
// the known workspace-write contract and fail closed if the upstream changes.
const [ro, from, to, dev, device, pid, proc, processDir, die, tmpfs, tmp, bind,
  source, target, separator, executable, ...args] = process.argv.slice(2)

try {
  if (process.platform !== 'darwin' || ro !== '--ro-bind' || from !== '/' || to !== '/'
    || dev !== '--dev' || device !== '/dev' || pid !== '--unshare-pid'
    || proc !== '--proc' || processDir !== '/proc' || die !== '--die-with-parent'
    || tmpfs !== '--tmpfs' || tmp !== '/tmp' || bind !== '--bind'
    || !source || !isAbsolute(source) || source !== target || separator !== '--' || !executable) {
    throw new Error('Unsupported sandbox runner arguments.')
  }
  const root = realpathSync(source)
  if (root === '/' || root === realpathSync(process.env.HOME || root)) {
    throw new Error('Choose a dedicated session workspace.')
  }
  const quote = path => JSON.stringify(path)
  const metadata = []
  for (let parent = dirname(root); ; parent = dirname(parent)) {
    metadata.push(`(literal ${quote(parent)})`)
    if (parent === '/') break
  }
  const profile = [
    '(version 1)(deny default)(import "system.sb")(deny network*)',
    '(allow process-exec process-fork sysctl-read)',
    '(allow file-read* (subpath "/bin") (subpath "/usr/bin"))',
    `(allow file-read-metadata ${metadata.join(' ')})`,
    `(allow file-read* file-write* (subpath ${quote(root)}))`,
  ].join('')
  const result = spawnSync('/usr/bin/sandbox-exec', ['-p', profile, '--', executable, ...args], {
    stdio: 'inherit',
    env: { PATH: '/usr/bin:/bin', HOME: root, TMPDIR: root, LANG: 'en_US.UTF-8' },
  })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
} catch (error) {
  console.error(`FlagQAI sandbox startup failed: ${error.message}`)
  process.exitCode = 71
}
