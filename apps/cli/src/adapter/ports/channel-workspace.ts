/** Workspace navigation messages shared by the terminal and its adapter. */
export type TuiWorkspaceKind = 'local' | 'provider'

export interface TuiWorkspaceTarget {
  uri: string
  cwd: string
  label: string
  description?: string
  kind: TuiWorkspaceKind
  badge: string
}

export interface TuiWorkspaceEntry {
  id: string
  path: string
  title: string
  present: boolean
  sessionCount: number
}

export interface TuiWorkspaceCommand {
  name: string
  aliases?: readonly string[]
  description: string
  run(
    input: string,
    context: { cwd: string },
    signal?: AbortSignal,
  ): Promise<TuiWorkspaceCommandResult> | TuiWorkspaceCommandResult
}

export type TuiWorkspaceCommandResult =
  | { kind: 'choices'; title: string; choices: readonly TuiWorkspaceChoice[] }
  | { kind: 'target'; target: TuiWorkspaceTarget }

export interface TuiWorkspaceChoice {
  id: string
  label: string
  description?: string
  badge?: string
  choose(signal?: AbortSignal): Promise<TuiWorkspaceCommandResult> | TuiWorkspaceCommandResult
  input?: {
    initialValue?: string
    placeholder?: string
    submit(value: string, signal?: AbortSignal): Promise<TuiWorkspaceCommandResult> | TuiWorkspaceCommandResult
  }
}
