import type {
  Model,
  PythonStyle,
  WorkspaceState,
} from "../contracts/quantum-workspace";

type FileContext = Pick<
  WorkspaceState,
  "name" | "project" | "activeProjectTab"
>;

export function pythonStyleKey(state: FileContext): string {
  return JSON.stringify(
    state.activeProjectTab
      ? ["project", state.project?.id, state.activeProjectTab]
      : ["model", state.name],
  );
}

/** A UI hint only: never used to restrict, transform or execute Python. */
export function detectedPythonStyle(source: string): PythonStyle | undefined {
  const code = source.replace(
    /'''[\s\S]*?'''|"""[\s\S]*?"""|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|#[^\n]*/g,
    " ",
  );
  if (
    /\bfrom\s+flagquantum\.synth\b/.test(code) ||
    /\bimport\s+flagquantum\.synth\b/.test(code) ||
    /\bfrom\s+flagquantum\s+import\s+\(?\s*synth\b/.test(code) ||
    /\b\w+\s*\.\s*synth\s*\.\s*synthesize\s*\(/.test(code) ||
    /\bsynth\s*\.\s*synthesize\s*\(/.test(code)
  )
    return "synthesis";
  if (
    /\bfrom\s+flagquantum\s+import\s+\(?\s*Circuit\b/.test(code) ||
    /\b(?:fq|flagquantum)\s*\.\s*Circuit\s*\(/.test(code)
  )
    return "gates";
  return undefined;
}

export const pythonStyleLabels = {
  synthesis: "High-level synthesis",
  gates: "Gate-level circuit",
} satisfies Record<PythonStyle, string>;

export function validPythonStyle(value: unknown): PythonStyle | undefined {
  return value === "gates" || value === "synthesis" ? value : undefined;
}

export function pythonStyleOverride(
  state: FileContext & Pick<WorkspaceState, "pythonStyles">,
): PythonStyle | undefined {
  return validPythonStyle(state.pythonStyles?.[pythonStyleKey(state)]);
}

export function modelWithPythonStyle(
  model: Model,
  state: WorkspaceState,
): Model {
  const pythonStyle = model.language === "python" && pythonStyleOverride(state);
  return pythonStyle ? { ...model, pythonStyle } : model;
}

export function updatePythonStyles(
  state: Pick<WorkspaceState, "pythonStyles">,
  file: FileContext,
  style?: PythonStyle,
): NonNullable<WorkspaceState["pythonStyles"]> {
  const pythonStyles = { ...state.pythonStyles };
  const key = pythonStyleKey(file);
  if (style) pythonStyles[key] = style;
  else delete pythonStyles[key];
  return pythonStyles;
}
