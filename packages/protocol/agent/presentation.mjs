// SPDX-License-Identifier: MIT
// Derived from dsh-TUI; see LICENSE and ../README.md for provenance.
/** Whether a call presentation suppresses the tool card. */
export function isSuppressedPresentation(presentation) {
  return presentation !== undefined && (presentation.card === 'question' || presentation.card === 'subagent' || presentation.card === 'todo');
}
