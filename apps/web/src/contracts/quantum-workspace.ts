export type ProjectRun = {
  id: string;
  name: string;
  path: string;
  entry: string;
  snapshot_hash: string;
  disk_hash: string;
  files: { path: string; sha256: string }[];
};
import type {
  ProjectInfo,
  ProjectTab,
  ProjectDraft,
  ProjectAction,
} from "../state/project-workspace";
export type Page = "model" | "synthesis" | "program" | "execution" | "jobs";
export type Instruction = {
  name: string;
  wires: number[];
  params?: Record<string, unknown>;
  line?: number | null;
  group?: string;
};
export type CircuitNode = {
  id: string;
  label: string;
  children: CircuitNode[];
  gate_indices: number[];
  wires: number[];
  gate_count: number;
  gate_counts: Record<string, number>;
  depth?: number;
  source_start?: number | null;
  source_end?: number | null;
};
export type CompiledProgram = {
  measurement_qubits?: number[];
  backend?: string;
  transport?: string;
  qubits: number;
  depth: number;
  version: string;
  instructions: Instruction[];
  gate_counts: Record<string, number>;
  registers?: { name: string; wires: number[] }[];
  groups?: Record<string, string>;
  logical_instructions?: Instruction[];
  hierarchy?: CircuitNode;
  source_hash?: string;
  protocol_version?: string;
};
export type SourceOrigin = {
  project?: ProjectRun;
  language: SourceLanguage;
  source: string;
  run_id?: string;
  source_hash?: string;
  execution_status?: string;
};
export type SavedMeasurement = {
  kind: string;
  qubits: number[];
  shots: number | null;
  batches?: {
    state: string;
    key_type: "integer" | "string";
    count: number;
  }[][];
  value?: unknown;
  metadata: Record<string, unknown>;
  statistics: Record<string, unknown>;
};
export type ExperimentInfo = {
  python_run?: {
    project?: ProjectRun;
    id: string;
    source_hash: string;
    execution_status: string;
    transport: string;
    task_path: string;
    elapsed_seconds?: number;
    sdk_version?: string;
  };
  id: string;
  filename: string;
  sha256: string;
  imported_at: number;
  producer_version: string;
  program_hash: string;
  has_result: boolean;
  measurements: SavedMeasurement[];
  execution_plan: Record<string, unknown> | null;
  accuracy?: unknown;
  runtime?: unknown;
  provenance?: unknown;
  metrics?: unknown;
  value?: unknown;
  state?: unknown;
  samples?: unknown;
};
export type ExperimentImport = {
  id: string;
  program: ProgramSnapshot;
  job?: QuantumJob;
};
export type ProgramSnapshot = {
  experiment?: ExperimentInfo;
  origin?: SourceOrigin;
  id: string;
  name: string;
  source: string;
  compiled: CompiledProgram;
  created: number;
};
export type MeasurementResult = CompiledProgram & {
  counts: Record<string, number>;
  shots: number;
  seed: number | null;
  elapsed_seconds: number | null;
  decoded?: { state: string; count: number; values: Record<string, number> }[];
};
export type QuantumJob = {
  experiment?: ExperimentInfo;
  origin?: SourceOrigin;
  id: string;
  name: string;
  status: "queued" | "running" | "completed" | "failed";
  request: { source: string; shots: number; seed: number | null };
  result?: MeasurementResult;
  error?: string;
};
export type Diagnostic = {
  message: string;
  line: number;
  column: number;
  start: number;
  length: number;
  severity: "error" | "warning";
};
export type SourceLanguage = "qasm" | "python";
export type Model = {
  name: string;
  source: string;
  description?: string;
  language?: SourceLanguage;
};
export type EditorLink = {
  savedAt?: number;
  project?: { id: string; path: string };
  id: string;
  path: string;
  modelName: string;
  base: string;
  revision: string;
  incoming?: { source: string; revision: string };
  updated?: number;
  previous?: string;
  change?: {
    before: string;
    after: string;
    agentSource?: string;
    revision: string;
    outcome: "pending" | "accepted" | "kept" | "undone";
  };
};
export type WorkspaceState = {
  project?: ProjectInfo;
  projectTabs?: ProjectTab[];
  activeProjectTab?: string;
  projectScratch?: ProjectDraft;
  language?: SourceLanguage;
  languageDrafts?: Partial<
    Record<
      SourceLanguage,
      { name: string; source: string; editorLink?: EditorLink; undo: string[] }
    >
  >;
  comparison?: { left: string; right: string };
  pythonRunId?: string;
  editorLink?: EditorLink;
  schema: "flagqai.quantum-workspace.v1";
  page: Page;
  name: string;
  source: string;
  programs: ProgramSnapshot[];
  selectedProgramId: string | null;
  models: Model[];
  jobs: QuantumJob[];
  selectedJobId: string | null;
  execution: ProgramSnapshot | null;
  shots: number;
  seed: number;
  jobName: string;
  zoom: number;
  agentOpen: boolean;
  busy: boolean;
  error: { source: string; message: string } | null;
  undo: string[];
};
export type WorkspaceAction =
  | ProjectAction
  | { type: "compare-experiments"; left?: string; right?: string }
  | { type: "import-experiment"; record: ExperimentImport; open?: boolean }
  | { type: "restore-experiments"; records: ExperimentImport[] }
  | {
      type: "review-agent-change";
      id: string;
      revision: string;
      expectedSource: string;
      decision: "accept" | "keep" | "undo";
    }
  | { type: "language"; language: SourceLanguage }
  | { type: "python-run"; id: string }
  | { type: "add-agent-model"; model: Model }
  | {
      type: "open-agent-model";
      model: Model;
      file: { id: string; path: string; source: string; revision: string };
    }
  | {
      type: "link-editor";
      name: string;
      expectedSource: string;
      file: { id: string; path: string; source: string; revision: string };
    }
  | {
      type: "file-changed";
      id: string;
      source: string;
      revision: string;
      time: number;
    }
  | {
      type: "resolve-file";
      id: string;
      revision: string;
      expectedSource: string;
      source: string;
    }
  | { type: "unlink-editor" }
  | { type: "navigate"; page: Page }
  | { type: "edit"; source: string }
  | { type: "model"; model: Model; preserveDraft?: boolean }
  | { type: "compiled"; program: ProgramSnapshot }
  | { type: "program"; id: string }
  | { type: "recover-program"; program: ProgramSnapshot }
  | { type: "import-agent-program"; program: ProgramSnapshot }
  | { type: "jobs"; jobs: QuantumJob[] }
  | { type: "merge-jobs"; jobs: QuantumJob[] }
  | { type: "job"; id: string }
  | { type: "busy"; value: boolean }
  | { type: "error"; source: string; message: string }
  | {
      type: "preferences";
      shots?: number;
      seed?: number;
      jobName?: string;
      zoom?: number;
    }
  | { type: "agent"; open: boolean }
  | { type: "save" }
  | { type: "undo" }
  | { type: "use-draft" };
