// SPDX-License-Identifier: MIT
// Derived from dsh-TUI; see LICENSE and README.md for provenance.
/**
 * Backend-neutral token accounting helpers for the shared projector. Pricing
 * policy (which rate window a request ran in, what a token costs) is not here:
 * the projector receives the window as an injected `pricingWindow` and only
 * buckets counts; pricing tables stay with their backend.
 */
import type { CostTokenBuckets, TokenBucket, TokenUsage } from '../protocol/agent/channel-view.mjs';
import type { UsageDelta } from '../protocol/agent/events.mjs';
/** Rate window a usage is bucketed under (`peak`/`idle` price separately). */
export type PricingWindow = 'peak' | 'idle';
/** Zero token totals for a new or reset session. */
export declare function emptyTokenUsage(): TokenUsage;
/** Empty peak/idle buckets for one model's cost accumulation. */
export declare function emptyCostBuckets(): CostTokenBuckets;
/** Add one usage to the bucket of its rate window (in place). */
export declare function addUsageToBucket(bucket: TokenBucket, usage: UsageDelta): void;
/**
 * Context-bar token estimate for model-visible text: a per-code-point weighted
 * count by script class (see the rates above), rounded up.
 *
 * Pure and deterministic: non-negative, zero only for the empty string, and
 * monotonic — appending characters never lowers the result. A single call on
 * pure ASCII input is exactly `ceil(length / 4)` (there is an explicit fast
 * path). Rounding happens per call, so summing this estimator over messages
 * can differ from rounding the summed characters once by at most one token
 * per call (ASCII-only sums included). ANSI escapes are not stripped: they
 * are ASCII, and the provider tokenizes the literal message bytes rather than
 * the rendered cells.
 *
 * @param text - Model-visible text (a prompt, an assistant block, a tool
 *   result); widths are irrelevant here, this counts characters, not cells.
 * @returns The estimated token count (0 for empty input).
 */
export declare function estimateTokens(text: string): number;
/**
 * The same script-weighted estimate as estimateTokens, WITHOUT the per-call
 * rounding: a fractional token count that is exactly additive over fragments.
 * The live tps path accumulates this over stream deltas and rounds ONCE at
 * the read -- per-delta ceil would inflate a stream of 2-3 character deltas
 * to one token each (4x for ASCII), and the old chars/4 fallback under-
 * counted CJK ~3x (one ideograph is ~0.7-1 token, not 0.25).
 * @param text - Any text fragment (a stream delta).
 * @returns the fractional token estimate (0 for empty input).
 */
export declare function estimateTokensFraction(text: string): number;
/** Reported output count when usable; durable imports may predate strict validation. */
export declare function usageOutputTokens(usage: UsageDelta | undefined): number | undefined;
