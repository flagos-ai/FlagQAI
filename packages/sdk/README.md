# `@flagqai/sdk`

The shared JavaScript and TypeScript client for the FlagQAI service protocol.
It runs in modern browsers, Node.js, and desktop webviews using the platform
`fetch`, `ReadableStream`, and `AbortSignal` implementations.

```js
import { createFlagQaiClient } from "@flagqai/sdk";

const client = createFlagQaiClient({ baseUrl: "http://127.0.0.1:4096" });
const session = await client.openSession({ backendId: "dsh", cwd: process.cwd() });

for await (const record of client.events(session.id)) {
  console.log(record.event);
}
```

When the event stream yields `permission.request` or `question.request`, use
`answerPermission`, `answerQuestion`, or `cancelQuestion` with that request's
identifier. The server accepts each pending interaction once.

The client exposes no model-provider credentials. Authentication and provider
configuration stay inside the FlagQAI service host. Use an `AbortSignal` to
stop a request or event stream and `lastEventId` to resume buffered SSE events.

Event streams default to a 45-second idle read timeout. Any received transport
chunk, including SSE heartbeat comments, resets the read deadline; comments do
not yield agent events or advance the replay cursor. A stalled read throws
`event_stream_timeout` and releases its reader. Aborting an idle stream also
releases the reader promptly. Set `idleTimeoutMs` in `events()` options to a
non-negative integer in milliseconds (`0` disables the timeout for legacy
servers without heartbeats). This deadline applies to pending body reads,
not model generation time or time spent processing a yielded event.
