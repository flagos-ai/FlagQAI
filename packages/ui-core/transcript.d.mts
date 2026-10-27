// SPDX-License-Identifier: MIT
// Derived from dsh-TUI; see LICENSE and README.md for provenance.
/** Backend-neutral transcript limits and text helpers shared by the projector,
 *  the fold pass and the local-output paths. */
export declare const ARGS_PREVIEW_LIMIT = 160;
export declare const RESULT_PREVIEW_LIMIT = 240;
/** Local `!`-command output cap (mirrors the result preview limit). */
export declare const LOCAL_OUTPUT_LIMIT = 240;
/**
 * In-memory transcript window cap. Older rows beyond this count are folded:
 * their full-text fields (assistant/reasoning text, tool args/results) are
 * dropped and only the preview/status metadata kept, so a long merge/deploy
 * turn cannot grow the TUI's RAM without bound. The session log still holds
 * everything (`/export` reads it, `/resume` replays it); the
 * folded row keeps its kind/id so scrolling and selection stay stable.
 */
export declare const MAX_ROWS = 600;
export declare function preview(text: string, limit: number): string;
