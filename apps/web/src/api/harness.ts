import type { FlagQaiClient } from "../../../../packages/sdk/index.d.ts";
import { createFlagQaiClient } from "../../../../packages/sdk/index.mjs";

// The shared SDK owns Agent transport; the Web app owns no agent loop or session log.
export const harnessClient = createFlagQaiClient() as FlagQaiClient;

export async function workspaceAgentConfig(
  signal?: AbortSignal,
): Promise<{ cwd: string }> {
  const response = await fetch("/api/agent", { signal });
  if (!response.ok)
    throw new Error("Cannot load the local Agent workspace configuration.");
  return response.json();
}
