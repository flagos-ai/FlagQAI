import type { Model } from "../contracts/quantum-workspace";
import { examples, interpretPrompt } from "./templates.ts";

// Only the trusted, bounded built-in templates use this translation.
// User uploads and saved models retain their original language and source.
export function pythonTemplate(model: Model): Model {
  const width = model.source.match(/qreg q\[(\d+)\];/)?.[1];
  if (!width)
    throw new Error("Built-in template is missing its quantum register.");
  const operations: string[] = [];
  for (const line of model.source.split("\n")) {
    const text = line.trim();
    if (!text || /^(OPENQASM|include|qreg|creg|measure)\b/.test(text)) continue;
    if (text.startsWith("//")) {
      operations.push("#" + text.slice(2));
      continue;
    }
    const gate = text.match(/^(h|x|cx|ccx)\s+(.+);$/);
    if (!gate) throw new Error("Unsupported operation in built-in template.");
    const wires = [...gate[2].matchAll(/q\[(\d+)\]/g)].map((m) => m[1]);
    operations.push(`circuit.${gate[1]}(${wires.join(", ")})`);
  }
  const filename =
    model.name === "Bell State"
      ? "bell"
      : model.name === "GHZ State"
        ? "ghz"
        : model.name === "X State"
          ? "x-state"
          : "arithmetic-" +
            model.name
              .replace(/^Quantum Arithmetic · /, "")
              .replace(/\s+/g, "")
              .replace(/\+/g, "-plus-");
  return {
    ...model,
    language: "python",
    source: [
      "import flagquantum as fq",
      "",
      `circuit = fq.Circuit(${width})`,
      ...operations,
      "",
      "result = fq.run(",
      "    circuit,",
      "    outputs=fq.counts(),",
      "    options=fq.ExecutionOptions(shots=1024, seed=42),",
      ")",
      "print(result.counts)",
      "",
      `fq.save("${filename}.fqx", result.plan, result=result)`,
      "",
    ].join("\n"),
  };
}

export const pythonExamples = examples.map(pythonTemplate);
export function interpretPythonPrompt(prompt: string): Model | null {
  const model = interpretPrompt(prompt);
  return model ? pythonTemplate(model) : null;
}
