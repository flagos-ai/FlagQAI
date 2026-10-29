import { FlagQaiApiError } from "../../../../packages/sdk/index.mjs";
import type {
  FlagQaiClient,
  SessionResource,
} from "../../../../packages/sdk/index.d.ts";

export type SessionReference = Pick<
  SessionResource,
  "id" | "backendId" | "sessionId" | "cwd"
>;
export type PendingDelivery = {
  session: string;
  clientMessageId: string;
  text: string;
  draft: string;
};
export const DELIVERY_KEY = "fq-agent-pending-delivery-v1";
export function deliveryWasObserved(
  pending: PendingDelivery | null,
  resourceId: string,
  event: { type: string; id?: unknown },
) {
  return (
    !!pending &&
    pending.session === resourceId &&
    event.type === "user.message" &&
    event.id === pending.clientMessageId
  );
}

export function readPendingDelivery(
  storage: Pick<Storage, "getItem">,
): PendingDelivery | null {
  try {
    const value = JSON.parse(storage.getItem(DELIVERY_KEY) || "null");
    return value &&
      ["session", "clientMessageId", "text", "draft"].every(
        (key) => typeof value[key] === "string" && value[key].length > 0,
      )
      ? value
      : null;
  } catch {
    return null;
  }
}

// Rebind an existing native conversation only. A transient failure must never
// fall through to opening a fresh conversation or resubmitting a message.
export async function recoverNativeSession(
  client: Pick<FlagQaiClient, "getSession" | "openSession">,
  reference: SessionReference,
  cwd: string,
) {
  if (reference.cwd !== cwd)
    throw new Error("The saved Agent session belongs to another workspace.");
  try {
    return await client.getSession(reference.id);
  } catch (problem) {
    if (!(problem instanceof FlagQaiApiError) || problem.status !== 404)
      throw problem;
  }
  return client.openSession({
    backendId: reference.backendId,
    cwd,
    sessionId: reference.sessionId,
  });
}
