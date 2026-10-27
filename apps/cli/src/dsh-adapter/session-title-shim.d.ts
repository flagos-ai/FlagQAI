// Keep the optional title event visible to both the headless session host and
// the terminal client without importing renderer-only JSX declarations.
import type {} from '@deepseek-ai/dsh-session'

// The strict v4 session reader expects messageSeqs/source on title records.
// Both writers construct this payload through userTitleData().
declare module '@deepseek-ai/dsh-session' {
  interface SessionEventMap {
    'session/title': {
      readonly title: string
      readonly messageSeqs: number[]
      readonly source: { readonly kind: 'fallback' | 'provider' | 'user'; readonly provider?: string; readonly model?: unknown }
    }
  }
}
