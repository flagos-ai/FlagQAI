import {isAbsolute, join, resolve} from 'node:path';
import type {FileCandidate} from '../../utils/fileSuggestions.js';
import {homeDir} from '../../utils/paths.js';
import type {FileSuggestionFs} from './types.js';

const ignoredDirectories = /^(?:\.git|node_modules|\.venv|dist|cmake-build(?:[-_].*)?|build(?:[-_].*)?)$/iu;
const maxDepth = 12;
const maxDirectories = 512;
const maxCandidates = 8192;
const maxEntriesPerDirectory = 200;

/** Final nonempty segment using either terminal path separator. */
export function basename(path: string): string {
  return path.replace(/[\\/]+$/u, '').split(/[\\/]/u).at(-1) ?? '';
}

/** Compare session paths lexically without asking the host filesystem. */
export function normalizeCwd(path: string, caseInsensitive: boolean): string {
  const slashes = path.replace(/\\/gu, '/');
  const prefix = slashes.startsWith('//') ? '//' : slashes.startsWith('/') ? '/' : '';
  const rawParts = slashes.slice(prefix.length).split('/').filter(Boolean);
  const anchored = Boolean(prefix) || /^[a-z]:$/iu.test(rawParts[0] ?? '');
  const rootParts = prefix === '//' ? rawParts[0] === '?' && /^unc$/iu.test(rawParts[1] ?? '')
    ? 4 : rawParts[0] === '?' ? 2 : 2 : /^[a-z]:$/iu.test(rawParts[0] ?? '') ? 1 : 0;
  const parts: string[] = [];
  for (const part of rawParts) {
    if (!part || part === '.') continue;
    if (part === '..' && parts.length > rootParts && parts.at(-1) !== '..') parts.pop();
    else if (part !== '..' || !anchored) parts.push(part);
  }
  const normalized = (prefix + parts.join('/')) || prefix;
  return caseInsensitive ? normalized.toLowerCase() : normalized;
}

function isContainerPath(path: string, caseInsensitive: boolean): boolean {
  if (path === '/' || path === '//') return true;
  if (path === normalizeCwd(homeDir(), caseInsensitive)) return true;
  if (/^[a-z]:$/iu.test(path) || /^\/\/\?\/[a-z]:$/iu.test(path)) return true;
  if (/^\/\/[^/]+\/[^/]+$/u.test(path)) return true;
  return /^\/\/\?\/unc\/[^/]+\/[^/]+$/iu.test(path);
}

export function sessionCwdMatches(
  stateCwd: string, headerCwd: string, caseInsensitive = process.platform === 'win32',
): boolean {
  if (!stateCwd || !headerCwd) return false;
  const state = normalizeCwd(stateCwd, caseInsensitive);
  const header = normalizeCwd(headerCwd, caseInsensitive);
  if (state === header) return true;
  if (isContainerPath(state, caseInsensitive) || isContainerPath(header, caseInsensitive)) return false;
  return state.startsWith(`${header}/`) || header.startsWith(`${state}/`);
}

function candidate(path: string, name: string, kind: 'file' | 'directory'): FileCandidate {
  return {id: path, path, displayPath: path, name, kind, score: 0};
}

function safeEntryName(name: unknown): name is string {
  return typeof name === 'string' && name !== '' && name !== '.' && name !== '..' &&
    !/[\\/\u0000-\u001f\u007f]/u.test(name);
}

function requestedCount(topK: number): number {
  return Number.isFinite(topK) ? Math.max(0, Math.min(200, Math.floor(topK))) : 0;
}

/** Resolve only the directory portion; keep the user's separator in completions. */
export async function listPathCandidates(
  fs: FileSuggestionFs, cwd: string, query: string, signal: AbortSignal | undefined, topK: number,
): Promise<FileCandidate[]> {
  const limit = requestedCount(topK);
  if (!limit || signal?.aborted) return [];
  const slash = Math.max(query.lastIndexOf('/'), query.lastIndexOf('\\'));
  const typedDirectory = slash < 0 ? '' : query.slice(0, slash + 1);
  const partial = query.slice(slash + 1).toLowerCase();
  const separator = typedDirectory.endsWith('\\') ? '\\' : '/';
  const nativeDirectory = typedDirectory.replace(/\\/gu, '/');
  const expandedDirectory = nativeDirectory === '~/' ? `${homeDir()}/`
    : nativeDirectory.startsWith('~/') ? `${homeDir()}/${nativeDirectory.slice(2)}` : nativeDirectory;
  const directory = expandedDirectory
    ? isAbsolute(expandedDirectory) ? resolve(expandedDirectory) : resolve(cwd, expandedDirectory)
    : cwd;
  try {
    const entries = await fs.listDir(await fs.resolve(directory));
    if (signal?.aborted) return [];
    return entries
      .filter(entry => safeEntryName(entry.name) &&
        (entry.type === 'file' || entry.type === 'directory') &&
        entry.name.toLowerCase().startsWith(partial))
      .sort((left, right) => left.name.localeCompare(right.name))
      .slice(0, limit)
      .map(entry => candidate(typedDirectory + entry.name +
        (entry.type === 'directory' ? separator : ''), entry.name, entry.type as 'file' | 'directory'));
  } catch {
    return [];
  }
}

/** Scan source-sized slices of each directory so generated siblings cannot monopolize the budget. */
export async function listFilesDeepCandidates(
  fs: FileSuggestionFs | undefined, root: string, signal?: AbortSignal,
): Promise<FileCandidate[]> {
  if (!fs || signal?.aborted) return [];
  const results: FileCandidate[] = [];
  const queue: Array<{path: string; relative: string; depth: number}> =
    [{path: root, relative: '', depth: 0}];
  let inspected = 0;
  while (queue.length && inspected < maxDirectories && results.length < maxCandidates) {
    if (signal?.aborted) return [];
    const directory = queue.shift()!;
    inspected += 1;
    let entries: Awaited<ReturnType<FileSuggestionFs['listDir']>>;
    try {
      entries = await fs.listDir(await fs.resolve(directory.path));
    } catch {
      continue;
    }
    if (signal?.aborted) return [];
    for (const entry of entries.filter(entry => safeEntryName(entry.name))
      .sort((a, b) => a.name.localeCompare(b.name)).slice(0, maxEntriesPerDirectory)) {
      if (entry.type !== 'file' && entry.type !== 'directory') continue;
      const relative = directory.relative ? `${directory.relative}/${entry.name}` : entry.name;
      if (entry.type === 'directory' && ignoredDirectories.test(entry.name)) continue;
      const shown = entry.type === 'directory' ? `${relative}/` : relative;
      results.push(candidate(shown, entry.name, entry.type));
      if (results.length >= maxCandidates) break;
      if (entry.type === 'directory' && directory.depth < maxDepth) {
        queue.push({path: entry.target?.displayPath ?? join(directory.path, entry.name),
          relative, depth: directory.depth + 1});
      }
    }
  }
  return signal?.aborted ? [] : results;
}
