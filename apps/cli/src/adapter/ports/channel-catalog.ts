/** Commands and results exchanged across the CLI's channel boundary. */
export type LocalizedDescriptions = Readonly<Partial<Record<'zh' | 'en', string>>>

export interface LocalCommand {
  name: string
  description: string
  descriptions?: LocalizedDescriptions
  tag?: string
  descriptionKey?: string
  external?: boolean
  acceptsImages?: boolean
  skill?: boolean
  origin?: 'backend'
}

export interface CommandCompletion extends LocalCommand {
  replacement: string
  commandLine: string
  descriptionKey?: string
}

export interface BalanceInfo {
  currency: string
  total: number
  granted: number
  toppedUp: number
}

export type BalanceResult =
  | { readonly ok: true; readonly isAvailable: boolean; readonly balances: readonly BalanceInfo[] }
  | { readonly ok: false; readonly reason: 'no-key' | 'network' | 'unauthorized' | 'http' | 'invalid'; readonly status?: number }

export type FileCandidateKind = 'file' | 'directory'

export interface FileCandidate {
  id: string
  path: string
  displayPath: string
  name: string
  kind: FileCandidateKind
  score: number
}

export interface RecapOutcome {
  summary: string | null
  title?: string
  error?: string
}
