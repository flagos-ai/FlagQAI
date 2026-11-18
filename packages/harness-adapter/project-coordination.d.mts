export type CoordinationAction = (operation: string, args: Record<string, unknown>, signal: AbortSignal) => Promise<any>;
export function createProjectCoordinator(native: {
  sessionId: string;
  signal: AbortSignal;
  available(): boolean;
  start(id: string, label: string, prompt: string, signal: AbortSignal): Promise<{ childId: string; result: Promise<{ stopReason?: string }> }>;
  observe(id: string, signal: AbortSignal): Promise<{ status: string; revision: string; detail?: string }>;
  onError(error: unknown): void;
}): { control(input: Record<string, any>, action: CoordinationAction, signal: AbortSignal): Promise<any> };
