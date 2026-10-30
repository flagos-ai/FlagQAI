import test from "node:test";
import assert from "node:assert/strict";
import { FlagQaiApiError } from "../../../packages/sdk/index.mjs";
import {
  DELIVERY_KEY,
  deliveryWasObserved,
  readPendingDelivery,
  recoverNativeSession,
} from "../src/state/agent-recovery.ts";
const reference = {
  id: "resource-1",
  backendId: "fixture",
  sessionId: "native-1",
  cwd: "/workspace",
};
test("recovery reuses a running native resource without opening a session or sending a message", async () => {
  let opened = 0;
  const resource = { ...reference, status: "running" };
  assert.equal(
    await recoverNativeSession(
      {
        getSession: async (id) => {
          assert.equal(id, reference.id);
          return resource;
        },
        openSession: async () => {
          opened++;
        },
      },
      reference,
      reference.cwd,
    ),
    resource,
  );
  assert.equal(opened, 0);
});
test("a missing resource resumes only the same durable conversation", async () => {
  let input;
  await recoverNativeSession(
    {
      getSession: async () => {
        throw new FlagQaiApiError(404, "not_found", "missing");
      },
      openSession: async (value) => {
        input = value;
      },
    },
    reference,
    reference.cwd,
  );
  assert.deepEqual(input, {
    backendId: "fixture",
    cwd: "/workspace",
    sessionId: "native-1",
  });
});
test("outages and denied access never create a replacement conversation", async () => {
  for (const error of [
    new TypeError("offline"),
    new FlagQaiApiError(503, "offline", "offline"),
    new FlagQaiApiError(403, "denied", "denied"),
  ]) {
    await assert.rejects(
      recoverNativeSession(
        {
          getSession: async () => {
            throw error;
          },
          openSession: async () =>
            assert.fail("must not create another session"),
        },
        reference,
        reference.cwd,
      ),
      (problem) => problem === error,
    );
  }
  await assert.rejects(
    recoverNativeSession(
      {
        getSession: async () => assert.fail("foreign workspace"),
        openSession: async () => assert.fail("foreign workspace"),
      },
      reference,
      "/other",
    ),
    /another workspace/,
  );
});
test("uncertain delivery survives refresh with the exact original payload and ID", () => {
  const pending = {
    session: reference.id,
    clientMessageId: "original-id",
    text: "Question\n\n<workspace_controls>original snapshot</workspace_controls>",
    draft: "Question",
  };
  const disk = new Map([[DELIVERY_KEY, JSON.stringify(pending)]]);
  assert.deepEqual(
    readPendingDelivery({ getItem: (key) => disk.get(key) }),
    pending,
  );
  for (const value of [
    "broken JSON",
    "{}",
    JSON.stringify({ ...pending, clientMessageId: null }),
  ])
    assert.equal(readPendingDelivery({ getItem: () => value }), null);
  assert.equal(
    readPendingDelivery({
      getItem: () => {
        throw Error("disabled");
      },
    }),
    null,
  );
});
test("only a matching native user-message ID confirms a delivery; similar text and another resource cannot", () => {
  const pending = {
    session: "resource",
    clientMessageId: "request",
    text: "same question",
    draft: "same question",
  };
  assert.equal(
    deliveryWasObserved(pending, "resource", {
      type: "user.message",
      id: "request",
    }),
    true,
  );
  assert.equal(
    deliveryWasObserved(pending, "resource", {
      type: "user.message",
      id: "other",
      text: "same question",
    }),
    false,
  );
  assert.equal(
    deliveryWasObserved(pending, "other-resource", {
      type: "user.message",
      id: "request",
    }),
    false,
  );
  assert.equal(
    deliveryWasObserved(pending, "resource", {
      type: "assistant.message",
      id: "request",
    }),
    false,
  );
});
