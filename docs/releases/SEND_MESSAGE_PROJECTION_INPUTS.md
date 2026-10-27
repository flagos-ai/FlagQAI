# SendMessage observation projection inputs

This private change for #93 replaces the Claude `SendMessage` observation projection. The implementation was written from the current protocol and caller contracts. The historical imported implementation body was not used as a design source.

Inputs inspected:

- `packages/protocol/agent/channel-view.d.mts`: message view, route, and state types.
- `apps/cli/src/backends/claude/translate/lanes.ts` and `messages.ts`: call and result observation sites.
- `apps/cli/scripts/verify-agent-team-channel.ts`: expected observable behavior.
- Generated `apps/cli/lib/types/backends/claude/send-message.d.ts`: exported signatures and contract comments only.

The projection does not send messages. A tool call records `issued`; an explicit error records `refused`; a structured result may report a supported settled state. A bare success remains `unknown` because it does not prove delivery. Actual message authority stays with the backend and channel service.

Passing tests or reducing exact-text overlap is not a source-rights clearance. The remaining imported code and private Git history still require separate disposition before public release.
