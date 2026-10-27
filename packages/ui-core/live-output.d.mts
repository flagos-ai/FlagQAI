// SPDX-License-Identifier: MIT
// Derived from dsh-TUI; see LICENSE and README.md for provenance.
/**
 * The bounded live-output tail of a running tool (`tool.output`, N4): the
 * shared projector appends every chunk here and publishes the retained
 * text on the tool row; the card renders the newest few lines of it.
 *
 * Bounded twice, so a chatty command can never grow the row: at most
 * {@link LIVE_OUTPUT_MAX_LINES} lines and {@link LIVE_OUTPUT_MAX_CHARS}
 * characters (16 KiB counted in UTF-16 code units). Whole lines leave from
 * the head first and are counted in `dropped`; a single line longer than
 * the whole budget keeps its newest characters (cut on a code-point
 * boundary). The text stays raw (ANSI, carriage returns): sanitizing is
 * the renderer's job, over the few lines it actually shows.
 *
 * Pure and allocation-light: an append scans only the new chunk for line
 * breaks (the running count rides on the tail) plus one slice when a
 * bound is crossed.
 */
/** Lines a tail keeps. */
export declare const LIVE_OUTPUT_MAX_LINES = 200;
/** Characters a tail keeps (16 KiB of UTF-16 code units). */
export declare const LIVE_OUTPUT_MAX_CHARS: number;
/** One running call's retained output. */
export interface LiveOutputTail {
    /** The retained text, oldest first; the last line may still be open. */
    readonly text: string;
    /** Line breaks in `text` (kept so an append never rescans the tail). */
    readonly breaks: number;
    /** Whole lines dropped from the head so far. */
    readonly dropped: number;
}
/** Lines in a tail's text (a trailing break closes the last line). */
export declare function liveOutputLineCount(tail: Pick<LiveOutputTail, 'text' | 'breaks'>): number;
/** Append one chunk, keeping the tail within both bounds. */
export declare function appendLiveOutput(tail: LiveOutputTail | undefined, chunk: string): LiveOutputTail;
