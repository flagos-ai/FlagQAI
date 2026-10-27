// SPDX-License-Identifier: MIT
// Derived from dsh-TUI; see LICENSE and ../README.md for provenance.
/**
* Stable session identity across backends.
* A bare session id is only unique inside one backend's catalog, so every
* cross-backend reference carries the backend id with it.
*/
/** One session of one backend. */
export interface AgentSessionRef {
  /** Backend id: `dsh`, `claude`, `acp:<agent>`. */
  readonly backendId: string;
  /** The backend's own session id (DSH session id, Claude session uuid). */
  readonly sessionId: string;
}
/** Backend assumed when a persisted reference carries no prefix. */
export declare const DEFAULT_BACKEND_ID = "dsh";
/**
* Serialize a reference as `<backendId>:<sessionId>`. DSH references
* serialize without a prefix, so DSH ids persisted by older builds (MRU
* lists, `--resume <id>`) stay valid as-is.
*/
export declare function formatSessionRef(ref: AgentSessionRef): string;
/**
* Parse {@link formatSessionRef} output. Backend ids may themselves contain
* a colon (`acp:gemini`), so the prefix is the longest known backend id the
* text starts with (followed by `:` and a non-empty session id); any other
* string is a bare DSH session id (DSH ids never need escaping this way).
*/
export declare function parseSessionRef(text: string, knownBackends: readonly string[]): AgentSessionRef;
/** Value equality of two references. */
export declare function sameSessionRef(a: AgentSessionRef, b: AgentSessionRef): boolean;
