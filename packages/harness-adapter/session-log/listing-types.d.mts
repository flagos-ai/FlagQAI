// SPDX-License-Identifier: MIT
// Derived from dsh-TUI; see LICENSE and ../README.md for provenance.
import type { SessionKind } from './header.mjs';
import type { SessionTitle } from './digest-types.mjs';
/**
 * Everything the browser shows for one session, and nothing that costs an
 * unbounded read to learn.
 *
 * That second half is an invariant, not an accident: every field here comes
 * from the persistence header, one `stat`, or a bounded window at one end of
 * the log. A session's full statistics (turn counts, tool totals, token spend)
 * require folding the entire event log, which is what the trajectory scene is
 * for — the browser stays responsive on a 4 MB log because it never asks a
 * question that big.
 */
export interface SessionSummary {
  readonly id: string;
  /**
   * The backend whose catalog lists this session (`claude`, `acp:<agent>`);
   * absent for a DSH session.
   */
  readonly backendId?: string;
  readonly kind: SessionKind;
  readonly title: SessionTitle;
  /** Working directory recorded in the header; '' when it recorded none. */
  readonly cwd: string;
  readonly createdAt: number;
  /**
   * Last activity: the later of the log's own mtime and this install's
   * last-used note. Both are lower bounds on "when this session was last
   * touched" — the mtime catches writes by another client (dsh web appends to
   * the same store), the note catches a resume this install performed. The
   * later of two lower bounds is the best available answer, and unlike a
   * composite value there is no risk of stitching halves from different
   * origins: this is one scalar with two witnesses.
   */
  readonly updatedAt: number;
  /** Log size in bytes; undefined when the backend owns no per-session file. */
  readonly bytes: number | undefined;
  /**
   * Whether the log holds a human message (including image-only input), or
   * the read was inconclusive. False requires a complete successful scan;
   * unknown logs must stay visible and out of empty-session cleanup.
   *
   * `list()` reports *materialized* sessions, not conversations: a session
   * that only ever recorded its own boot policy is a real stored session with
   * nothing to resume. Answering this is the consumer's job — the header does
   * not promise it — and getting it wrong is why one empty row per launch used
   * to accumulate in the picker.
   */
  readonly hasPrompt: boolean;
  /** Agent preset the session was composed from, when the deployment records one. */
  readonly agentPreset: string | undefined;
  /** Model last seen in the log's trailing window, when one is recorded. */
  readonly model: string | undefined;
  /** Sub-agent label from the run's descriptor (`subagent` kind only). */
  readonly label: string | undefined;
  /** Git branch noted when this install last used the session. */
  readonly branch: string | undefined;
  /** How many sub-agent runs name this session as their parent. */
  readonly childCount: number;
}
