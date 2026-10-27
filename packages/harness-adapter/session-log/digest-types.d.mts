// SPDX-License-Identifier: MIT
// Derived from dsh-TUI; see LICENSE and ../README.md for provenance.
export interface SessionTitle {
  readonly text: string;
  readonly source: TitleSource;
}
/** Which evidence produced a session's display title. */
export type TitleSource =
/** A `session/title` event appended after the session's own opening — a rename. */
'renamed'
/** The session's first `session/title`, written for it automatically. */
| 'auto'
/** No title event; the opening user prompt stands in. */
| 'prompt'
/** Nothing readable; the working directory's basename stands in. */
| 'fallback';
/** One exchange in the preview pane, newest last. */
export interface PreviewEntry {
  readonly role: 'user' | 'assistant';
  readonly text: string;
  readonly at: number | undefined;
}
/**
 * Facts a bounded read can recover from one session log.
 *
 * No "last event time" here on purpose: for an append-only log the file's
 * mtime says the same thing, is already read for session listing,
 * and needs no cache entry of its own.
 */
export interface SessionDigest {
  readonly title: SessionTitle | undefined;
  /** False only after a complete successful scan proves no human message;
  * true also keeps inconclusive reads visible and out of empty cleanup. */
  readonly hasPrompt: boolean;
  readonly model: string | undefined;
  /** Latest route found, or a complete scan proved there was no request. */
  readonly modelComplete?: boolean;
  readonly label: string | undefined;
  /** The whole log was covered, or the winning title was observed in the
  * trailing window; no unseen middle event can supersede it. */
  readonly titleComplete?: true;
}
