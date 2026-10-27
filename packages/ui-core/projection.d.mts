// SPDX-License-Identifier: MIT
// Derived from dsh-TUI; see LICENSE and README.md for provenance.
import type { ProjectionState, ChannelProjectionDeps, ProjectionHost } from './projection-types.mjs';
import type { AgentEvent, AgentEventMeta, ContentBlockView } from '../protocol/agent/events.mjs';
export type * from './projection-types.mjs';
/** Joined, trimmed text of every `text` block (what a bubble or card body shows). */
export declare function textOfBlocks(blocks: readonly ContentBlockView[] | undefined): string;
/** Create the shared projector over one channel state. */
export declare function createChannelProjection(state: ProjectionState, deps: ChannelProjectionDeps, host: ProjectionHost): {
    apply: (events: readonly AgentEvent[], meta: AgentEventMeta) => void;
    reset: () => void;
    settleStreaming: () => void;
    updateSpinnerMode: () => void;
    contextUsage: () => {
        readonly type: "context.usage";
        readonly used: number;
        readonly max?: number;
        readonly categories?: readonly {
            readonly name: string;
            readonly tokens: number;
            readonly kind: string;
        }[];
    } | undefined;
};
export type ChannelProjection = ReturnType<typeof createChannelProjection>;
