import { AsyncLocalStorage } from 'node:async_hooks'
import { spawn } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { dirname, isAbsolute, relative, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'

// Agent contexts share filesystem services. Install once, with the read
// boundary carried by the async execution of the selected native tool.
const roots = new AsyncLocalStorage<string>()
const installed = Symbol('macOS read isolation')
type FileProvider = Context['fs'] & { [installed]?: true }

// Verify the file type on the same descriptor that supplies the bytes.
const reader = `
  sysopen(my $file, $ARGV[0], O_RDONLY | O_NONBLOCK | O_NOFOLLOW)
    or die "open: $!";
  my @info = stat($file);
  die "expected an unshared regular file" unless @info && -f _ && $info[3] == 1;
  binmode(STDOUT);
  while (1) {
    my $size = sysread($file, my $chunk, 65536);
    die "read: $!" unless defined($size);
    last unless $size;
    print STDOUT $chunk or die "output: $!";
  }
`

async function* readBytes(root: string, path: string, signal?: AbortSignal): AsyncGenerator<Buffer> {
  const remainder = relative(root, path)
  if (!isAbsolute(path) || remainder === '..' || remainder.startsWith(`..${sep}`) || isAbsolute(remainder)) {
    throw new Error('Confined file read denied a target outside the workspace.')
  }
  const q = JSON.stringify
  const parents: string[] = []
  for (let parent = dirname(root); ; parent = dirname(parent)) {
    parents.push(`(literal ${q(parent)})`)
    if (parent === '/') break
  }
  const profile = [
    '(version 1)(deny default)(import "system.sb")(deny network*)',
    '(allow process-exec sysctl-read)',
    '(allow file-read* (literal "/usr/bin/perl"))',
    `(allow file-read* (subpath ${q(root)}))`,
    `(allow file-read-metadata ${parents.join(' ')})`,
  ].join('')
  signal?.throwIfAborted()
  const child = spawn('/usr/bin/sandbox-exec', [
    '-p', profile, '--', '/usr/bin/perl', '-f', '-MFcntl=O_RDONLY,O_NONBLOCK,O_NOFOLLOW',
    '-e', reader, '--', path,
  ], { cwd: root, env: { PATH: '/usr/bin:/bin' }, stdio: ['ignore', 'pipe', 'pipe'], signal })
  let failure: Error | undefined
  child.on('error', error => { failure = error })
  const closed = new Promise<number | null>(resolve => child.once('close', resolve))
  child.stderr.resume()
  try {
    for await (const chunk of child.stdout) yield chunk as Buffer
    if (await closed !== 0) throw new Error('Confined file read failed. Check workspace access and the Seatbelt runner.', { cause: failure })
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill()
    await closed
  }
}

async function* readText(root: string, path: string, signal?: AbortSignal): AsyncGenerator<string> {
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let sampleRemaining = 8192
  for await (const chunk of readBytes(root, path, signal)) {
    const sample = chunk.subarray(0, sampleRemaining)
    if (sample.includes(0)) throw new Error('Cannot read a binary file as text.')
    sampleRemaining -= sample.length
    yield decoder.decode(chunk, { stream: true })
  }
  yield decoder.decode()
}

export function withMacOSReadIsolation<T>(fs: FileProvider, workspace: string, run: () => Promise<T>): Promise<T> {
  if (process.platform !== 'darwin') throw new Error('File read isolation requires macOS Seatbelt.')
  const root = realpathSync(workspace)
  if (root === '/') throw new Error('File read isolation requires a dedicated workspace.')
  if (!fs[installed]) {
    const originalReadText = fs.readText.bind(fs)
    const originalStreamText = fs.streamText.bind(fs)
    const originalReadBytes = fs.readBytes.bind(fs)
    fs.readText = async (target, signal) => {
      const scope = roots.getStore()
      if (!scope) return originalReadText(target, signal)
      let text = ''
      for await (const part of readText(scope, fs.processPath(target), signal)) text += part
      return text
    }
    fs.streamText = (target, signal) => {
      const scope = roots.getStore()
      return scope ? Promise.resolve(readText(scope, fs.processPath(target), signal)) : originalStreamText(target, signal)
    }
    fs.readBytes = async (target, signal, limit) => {
      const scope = roots.getStore()
      if (!scope) return originalReadBytes(target, signal, limit)
      const chunks: Buffer[] = []
      let size = 0
      for await (const chunk of readBytes(scope, fs.processPath(target), signal)) {
        size += chunk.length
        if (size > limit) throw new Error(`Image exceeds the ${limit}-byte read limit.`)
        chunks.push(chunk)
      }
      return Buffer.concat(chunks, size)
    }
    fs[installed] = true
  }
  return roots.run(root, run)
}
