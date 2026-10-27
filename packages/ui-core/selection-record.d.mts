// SPDX-License-Identifier: MIT
// Derived from dsh-TUI; see LICENSE and README.md for provenance.
/**
 * Replay of the IDE-selection indicator from durable user-message content.
 * The submit path (`dsh-adapter/channel/ide-selection.ts`) appends an
 * `<attached-file path="…" selection count="N">` text block the channel itself
 * builds; parsing it back is channel-format knowledge, not backend knowledge,
 * so it lives beside the shared projector that needs it.
 */
import type { SelectionAttachment } from '../protocol/agent/channel-view.mjs';
/**
 * Derive the transcript indicator from the durable user-message content:
 * the `<attached-file path="…" selection count="N">` block the submit path
 * appended is part of the persisted event, so a replayed session can rebuild
 * the "Selected N lines from <file>" line even though the in-memory
 * message-id → attachment map starts empty. The indicator must not depend
 * on process-local state.
 */
export declare function replaySelectionAttachment(content: readonly unknown[] | undefined): SelectionAttachment | undefined;
