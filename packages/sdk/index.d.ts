export declare const FLAGQAI_SDK_PROTOCOL_VERSION: "2026-10-14.1";

/** Runtime-owned evidence of FlagQuantum MCP tool calls. Returned means the
 * tool did not report an error; scientific validity is a separate check. */
export interface FlagQuantumCallEvidence {
  source: 'harness-session-events';
  toolUseObserved: boolean;
  interfacesUsed: string[];
  callsTotal: number;
  callsReturned: number;
  callsFailed: number;
  callsPending: number;
  scientificResultValidated: null;
  /** Independent numerical check for the documented two-qubit parity QIR
   * ansatz only. A passing result is not a chemistry or full scientific verdict. */
  vqeNumericalEvidence: {
    status: 'not_observed' | 'incomplete' | 'unsupported' | 'passed' | 'failed';
    passed: boolean | null;
    method: 'two-qubit-parity-vqe-v1';
    callId: string | null;
    computedEnergy: number | null;
    exactGroundEnergy: number | null;
    energyVariance: number | null;
    reportedLossDelta: number | null;
    reasonCodes: string[];
  };
  /** Independent numerical check of the recorded two-qubit, weight-one
   * research VQE state and Hamiltonian. This is not a chemistry verdict. */
  researchVqeNumericalEvidence: {
    status: 'not_observed' | 'incomplete' | 'unsupported' | 'passed' | 'failed';
    passed: boolean | null;
    method: 'two-qubit-weight-one-research-vqe-v1';
    callId: string | null;
    computedEnergy: number | null;
    exactSectorEnergy: number | null;
    energyVariance: number | null;
    reportedEnergyDelta: number | null;
    reasonCodes: string[];
  };
  /** Validator calls made after the latest FlagQuantum research execution
   * returned, bound to its Evidence Bundle digest. Earlier matching-digest
   * validations cannot certify a repeated execution. This is not an
   * independent scientific verdict. */
  researchValidatorEvidence: {
    status: 'not_observed' | 'incomplete' | 'passed' | 'failed';
    passed: boolean | null;
    capabilityId: string | null;
    evidenceStatus: string | null;
    requiredValidators: string[];
    passedValidators: string[];
    failedValidators: string[];
    reasonCodes: string[];
  };
  calls: Array<{ callId: string; interface: string; startTime: number | null; endTime: number | null; durationSeconds: number | null; status: 'pending' | 'returned' | 'failed' }>;
}

/** Runtime-owned observations, with no model text or tool arguments/results.
 * Returned tool calls are not independent scientific validation. */
export interface ScienceTelemetry {
  schemaVersion: 1;
  source: 'backend-session-history' | 'backend-session-history+permission-journal';
  runId: string;
  /** Stable hashed backend/session identity when a local permission journal is mounted. */
  permissionSessionKey: string | null;
  /** Untimed outcomes; no ordering is implied relative to backend events. */
  permissionOutcomes: Array<'allow-once' | 'allow-always' | 'rejected'>;
  clockOrderValid: boolean;
  /** Applies to chronological backend events only, not permissionOutcomes. */
  timestampsComplete: boolean;
  counts: { toolCalls: number; toolReturned: number; toolFailed: number; toolPending: number;
    permissionDecisions: number | null; scientificInterventions: null };
  scientificResultValidated: null;
  events: Array<{ eventId: number; runId: string; stage: 'execution';
    eventType: 'turn_start' | 'turn_end' | 'tool_call' | 'tool_result';
    time: string | null; turn?: number | null; callId?: string; toolName?: string;
    status?: 'returned' | 'failed'; durationSeconds?: number | null;
    reason?: string | null }>;
}

export type MessagePlacement = "turn" | "steer" | "followup" | "now";
export type CancelCause = "user" | "interrupt" | "switch" | "dispose";
export type SessionStatus = "starting" | "idle" | "running" | "requires-action" | "disposed";
export type CancelOutcome = "confirmed" | "unknown" | "failed";

export interface RequestOptions { signal?: AbortSignal }
export interface EventOptions extends RequestOptions { lastEventId?: number; onOpen?: () => void; idleTimeoutMs?: number }
export interface Health {
  product: "FlagQAI";
  protocolVersion: string;
  status: "ready";
  backendCount: number;
}
export interface BackendDetection {
  installed: boolean;
  auth?: "ok" | "missing" | "unknown";
  version?: string;
  drift?: string;
  hint?: string;
  loginInSession?: true;
}
export interface BackendResource { id: string; label?: string; detection: BackendDetection }
export type ProviderKind = "catalog" | "custom";
export type ProviderProtocol = "openai-completions" | "openai-responses" | "anthropic-messages";
export interface ProviderDraft {
  kind: ProviderKind;
  route: string;
  baseURL?: string;
  api?: ProviderProtocol;
  apiKey?: string;
}
export interface ProviderState {
  available: boolean;
  ready: boolean;
  catalog: Array<{ route: string; label: string }>;
  configured: Array<{ route: string; kind: ProviderKind; baseURL?: string; api?: ProviderProtocol; models: string[]; keyConfigured: boolean }>;
}
export interface ProviderResource { route: string; model: string; keyConfigured: boolean }
export interface SessionCatalogResource {
  backendId: string;
  sessionId: string;
  title: string;
  titleSource: string;
  kind: "root" | "fork";
  cwd: string;
  createdAt: number;
  updatedAt: number;
  model?: string;
  branch?: string;
  availability: "available" | "active" | "occupied";
  resourceId?: string;
  ownerPid?: number;
  actions?: { archive: boolean; rename?: boolean };
}
export interface SessionSubagentView {
  id: string;
  parentSessionId: string;
  description: string;
  mode: 'one-shot' | 'continuable' | 'unknown';
  status: 'running' | 'completed' | 'failed' | 'cancelled' | 'unknown';
  createdAt: number;
  model?: string;
  summary?: string;
}
export interface SubagentTranscriptPage {
  events: Array<{ type: string; [key: string]: unknown }>;
  parentAgentId: string | null;
  hasOlder: boolean;
  skippedFromStart: number;
  truncated: boolean;
}

export interface SessionJobView {
  id: string;
  kind: string;
  label: string;
  status: 'running' | 'stopping' | 'completed' | 'failed' | 'killed';
  startedAt: number;
  finishedAt?: number;
  detail?: string;
  progress?: string;
  output: string;
  truncated: boolean;
}

export interface SessionResource {
  id: string;
  backendId: string;
  sessionId: string;
  cwd: string;
  status: SessionStatus;
  capabilities: string[];
}
export interface AutoCompactionPolicy { enabled: boolean; thresholdRatio: number; scope: 'session' }
/** Derived presentation from the same projector as the terminal client. */
export interface SessionViewRow {
  id: number;
  kind: string;
  seq?: number;
  anchor?: string;
  text: string;
  label?: string;
  subagent?: {
    agentId: string; description: string; status: string; startedAt?: number;
    durationMs?: number; model?: string; summary?: string; outputLines?: string[]; error?: string;
  };
  reasoningTokens?: number;
  durationMs?: number;
  tool?: {
    callId: string;
    name: string;
    status: string;
    startedAt?: number;
    durationMs?: number;
    argsText?: string;
    argsFull?: string;
    resultText?: string;
    resultFull?: string;
    liveOutput?: string;
    liveOutputDropped?: number;
    errorText?: string;
    callView?: unknown;
    resultView?: unknown;
  };
  turnUsage?: { input?: number; output?: number; durationMs?: number; outcome?: 'completed' | 'interrupted' | 'error' };
}
export interface SessionTodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}
export interface SessionViewEvent {
  type: "session.view";
  reset: boolean;
  rows: SessionViewRow[];
  removed: number[];
  order: number[];
  model?: string;
  provider?: string;
  title?: string;
  working: boolean;
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow?: number;
  context?: {
    occupancy?: { usedTokens: number; contextWindow?: number; source: 'projection' | 'backend' | 'sample' };
    compaction?: { startedAt: number; phase: 'prefill' | 'summary'; outputChars: number; cancellable: boolean };
    compactSupported: boolean;
    autoPolicy?: AutoCompactionPolicy;
  };
  tps?: number;
  commands: Array<{ name: string; description: string }>;
  /** Latest native whole-list snapshot; absent on older servers. */
  todos?: SessionTodoItem[];
  pending?: { permissions: string[]; questions: string[] };
  fileReview?: { changes: Array<{ id: string; callId: string; path: string; change: 'add' | 'delete' | 'update' | 'unknown'; movePath?: string; patch?: string; after?: string; unavailable?: string }>; omitted: number };
  queued?: Array<{ id: string; text: string; placement: 'steer' | 'followup' }>;
}
export interface SessionControlEvent {
  type: 'session.control';
  state: 'none' | 'stopping' | 'stopped' | 'unknown' | 'failed';
  requestId: string;
  cause: CancelCause;
  outcome?: CancelOutcome;
  stillQueued?: string[];
}
export interface AgentEventRecord {
  id: number;
  session: string;
  event: { type: string; [key: string]: unknown };
  meta: { wake: string; replay?: boolean; [key: string]: unknown };
}
export interface SubmitReceipt { accepted: boolean; reason?: string }
export interface CancelReceipt { stillQueued: string[]; outcome: CancelOutcome }
export type PermissionDecision =
  | { kind: "allow-once" }
  | { kind: "allow-always"; optionId?: string }
  | { kind: "reject"; message?: string };
export interface QuestionAnswers {
  answers: Array<{ selected: string[]; custom?: string }>;
}
export interface InteractionReceipt { accepted: true; requestId: string }

export declare class FlagQaiApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string, options?: ErrorOptions);
}

export interface FlagQaiClient {
  readonly baseUrl: string;
  health(options?: RequestOptions): Promise<Health>;
  listBackends(options?: RequestOptions): Promise<BackendResource[]>;
  listProviders(options?: RequestOptions): Promise<ProviderState>;
  discoverProviderModels(input: ProviderDraft, options?: RequestOptions): Promise<Array<{ id: string; name?: string; contextWindow?: number; maxTokens?: number }>>;
  configureProvider(input: ProviderDraft & { models: string[] }, options?: RequestOptions): Promise<ProviderResource>;
  listSessionModels(id: string, options?: RequestOptions): Promise<{ available: boolean; current?: { provider?: string; model: string }; models: Array<{ provider?: string; id: string; label: string }> }>;
  switchSessionModel(id: string, input: { provider?: string; model: string }, options?: RequestOptions): Promise<SessionResource>;
  listSessions(options?: RequestOptions): Promise<SessionCatalogResource[]>;
  openSession(input: { backendId: string; cwd: string; sessionId?: string }, options?: RequestOptions): Promise<SessionResource>;
  getSession(id: string, options?: RequestOptions): Promise<SessionResource>;
  flagQuantumEvidence(id: string, options?: RequestOptions): Promise<FlagQuantumCallEvidence>;
  scienceTelemetry(id: string, options?: RequestOptions): Promise<ScienceTelemetry>;
  disposeSession(id: string, options?: RequestOptions): Promise<void>;
  setSessionPlan(id: string, input: { active: boolean }, options?: RequestOptions): Promise<SessionControls>;
  getSessionControls(id: string, options?: RequestOptions): Promise<SessionControls>;
  setSessionControl(id: string, input: { kind: 'effort'; id: string | null } | { kind: 'mode'; id: string }, options?: RequestOptions): Promise<SessionControls>;
  getCompactionPolicy(id: string, options?: RequestOptions): Promise<{policy: AutoCompactionPolicy}>;
  setCompactionPolicy(id: string, input: {enabled: boolean; thresholdRatio: number}, options?: RequestOptions): Promise<{policy: AutoCompactionPolicy}>;
  compactSession(id: string, options?: RequestOptions): Promise<{ outcome: 'compacted' | 'unchanged' | 'requested' }>;
  renameSession(id: string, title: string, options?: RequestOptions): Promise<{ title: string }>;
  forkSession(id: string, input?: { anchor?: string; title?: string }, options?: RequestOptions): Promise<{ ref: { backendId: string; sessionId: string }; cwd: string }>;
  renameCatalogSession(backendId: string, sessionId: string, title: string, options?: RequestOptions): Promise<{ title: string }>;
  archiveSession(backendId: string, sessionId: string, options?: RequestOptions): Promise<{ archived: true }>;
  sessionContext(id: string, options?: RequestOptions): Promise<{ files: boolean; images: 'supported' | 'unsupported' | 'unknown'; maxImageBytes?: number; maxImages?: number }>;
  workspaceFiles(id: string, query?: string, options?: RequestOptions): Promise<Array<{ path: string; kind: 'file' | 'directory' }>>;
  previewContext(id: string, text: string, options?: RequestOptions): Promise<{ references: Array<{ start: number; end: number; path: string; available: boolean }>; blocks: string[]; missing: string[] }>;
  submitMessage(id: string, input: { clientMessageId: string; text: string; placement?: MessagePlacement; images?: Array<{ name: string; mediaType: string; data: string }> }, options?: RequestOptions): Promise<SubmitReceipt>;
  listSessionSubagents(id: string, options?: RequestOptions): Promise<{ supported: boolean; history: boolean; subagents: SessionSubagentView[] }>;
  subagentHistory(id: string, childId: string, before?: number, options?: RequestOptions): Promise<SubagentTranscriptPage>;
  listSessionJobs(id: string, options?: RequestOptions): Promise<{ supported: boolean; jobs: SessionJobView[] }>;
  stopSessionJob(id: string, jobId: string, options?: RequestOptions): Promise<{ stopped: string }>;
  cancelSession(id: string, input?: { cause?: CancelCause }, options?: RequestOptions): Promise<CancelReceipt>;
  answerPermission(id: string, requestId: string, decision: PermissionDecision, options?: RequestOptions): Promise<InteractionReceipt>;
  answerQuestion(id: string, requestId: string, answers: QuestionAnswers, options?: RequestOptions): Promise<InteractionReceipt>;
  cancelQuestion(id: string, requestId: string, options?: RequestOptions): Promise<InteractionReceipt>;
  events(id: string, options?: EventOptions): AsyncIterable<AgentEventRecord>;
}

export declare function createFlagQaiClient(options?: {
  baseUrl?: string | URL;
  fetch?: typeof globalThis.fetch;
}): FlagQaiClient;

export interface SessionControls {
  plan?: { available: boolean; active: boolean; pending: boolean | null };
  effort: { available: boolean; current: string | null; options: Array<{ id: string; label: string }>; fallback: boolean };
  mode: { available: boolean; current: string | null; options: Array<{ id: string; label: string; description?: string }> };
}

export interface SessionControlsEvent { type: 'session.controls'; controls: SessionControls }
