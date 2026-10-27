import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const candidates = process.platform === 'win32'
  ? [['python', []], ['py', ['-3']]]
  : [['python3', []], ['python', []]]
let selected
for (const [command, prefix] of candidates) {
  const probe = spawnSync(command, [...prefix, '-c', 'import sys; raise SystemExit(sys.version_info < (3, 9))'], {
    encoding: 'utf8', timeout: 5000,
  })
  if (!probe.error && probe.status === 0) { selected = { command, prefix }; break }
}
if (!selected) throw new Error('Scientific-run SDK verification requires Python 3.9 or newer on PATH')
const tests = fileURLToPath(new URL('../../../packages/scientific-core/python', import.meta.url))
const result = spawnSync(selected.command,
  [...selected.prefix, '-m', 'unittest', 'discover', '-s', tests, '-p', 'test_*.py', '-v'],
  { stdio: 'inherit', timeout: 30000 })
if (result.error || result.status !== 0) process.exitCode = result.status || 1
