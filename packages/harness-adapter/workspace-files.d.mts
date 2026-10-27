/** Structural file operations supplied by the native workspace service. */
export interface WorkspaceFileSystem {
  resolve(path: string): Promise<{ displayPath: string }>;
  stat(target: { displayPath: string }): Promise<{ type: 'file' | 'directory' | 'other' } | undefined>;
  readText(target: { displayPath: string }): Promise<string>;
  readBytes?(target: { displayPath: string }, signal: AbortSignal | undefined, maxBytes: number): Promise<Uint8Array>;
  listDir(target: { displayPath: string }): Promise<Array<{ name: string; type: 'file' | 'directory' | 'other' }>>;
}
export function createWorkspaceFileScope(fs: WorkspaceFileSystem | undefined, cwd: string): Promise<WorkspaceFileSystem>;
