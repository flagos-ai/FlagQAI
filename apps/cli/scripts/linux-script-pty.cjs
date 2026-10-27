/** Linux-only PTY adapter for installed CLI acceptance. Requires util-linux script(1). */
const { spawn: launch } = require('node:child_process')

function quote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`
}

exports.spawn = function spawn(command, args, options) {
  const commandLine = ['stty cols 100 rows 32', 'exec ' + [command, ...args].map(quote).join(' ')].join('; ')
  const child = launch('script', ['-q', '-e', '-f', '-c', commandLine, '/dev/null'], {
    cwd: options.cwd,
    env: options.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let reportedExit = false
  const reportExit = (callback, event) => {
    if (reportedExit) return
    reportedExit = true
    callback(event)
  }
  return {
    write(data) { child.stdin.write(data) },
    kill() { child.kill('SIGTERM') },
    onData(callback) { child.stdout.on('data', chunk => callback(chunk.toString('utf8'))) },
    onExit(callback) {
      child.on('error', error => reportExit(callback, { exitCode: error.code === 'ENOENT' ? 127 : 1 }))
      child.on('close', (exitCode, signal) => reportExit(callback, { exitCode: exitCode ?? (signal ? 128 : 1), signal }))
    },
  }
}
