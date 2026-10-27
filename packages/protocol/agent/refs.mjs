// SPDX-License-Identifier: MIT
// Derived from dsh-TUI; see LICENSE and ../README.md for provenance.
/**
* Stable session identity across backends.
* A bare session id is only unique inside one backend's catalog, so every
* cross-backend reference carries the backend id with it.
*/
/** Backend assumed when a persisted reference carries no prefix. */
export const DEFAULT_BACKEND_ID = 'dsh';
/**
* Serialize a reference as `<backendId>:<sessionId>`. DSH references
* serialize without a prefix, so DSH ids persisted by older builds (MRU
* lists, `--resume <id>`) stay valid as-is.
*/
export function formatSessionRef(ref) {
  return ref.backendId === DEFAULT_BACKEND_ID ? ref.sessionId : `${ref.backendId}:${ref.sessionId}`;
}
/**
* Parse {@link formatSessionRef} output. Backend ids may themselves contain
* a colon (`acp:gemini`), so the prefix is the longest known backend id the
* text starts with (followed by `:` and a non-empty session id); any other
* string is a bare DSH session id (DSH ids never need escaping this way).
*/
export function parseSessionRef(text, knownBackends) {
  let match;
  for (const backendId of knownBackends) {
    if (backendId === '' || backendId === DEFAULT_BACKEND_ID)
      continue;
    if (text.length <= backendId.length + 1 || !text.startsWith(`${backendId}:`))
      continue;
    if (match === undefined || backendId.length > match.length)
      match = backendId;
  }
  return match === undefined
    ? { backendId: DEFAULT_BACKEND_ID, sessionId: text }
    : { backendId: match, sessionId: text.slice(match.length + 1) };
}
/** Value equality of two references. */
export function sameSessionRef(a, b) {
  return a.backendId === b.backendId && a.sessionId === b.sessionId;
}
