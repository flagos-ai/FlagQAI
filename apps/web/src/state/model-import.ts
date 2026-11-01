import { MAX_EXPERIMENT_BYTES } from "../api/experiments.ts";

export const MAX_MODEL_BYTES = 32 * 1024;
export function modelImportKind(
  file: Pick<File, "name" | "size">,
  program = false,
) {
  const extension = file.name.match(/\.([^.]+)$/)?.[1].toLowerCase();
  if (
    extension !== "fqx" &&
    extension !== "qasm" &&
    extension !== "txt" &&
    (program || extension !== "py")
  )
    throw Error(
      program
        ? "Choose an OpenQASM .qasm or .txt file, or a .fqx experiment."
        : "Choose a Python .py, OpenQASM .qasm or .txt file, or a .fqx experiment.",
    );
  if (!file.size)
    throw Error(
      "This file is empty. Choose a file containing code or a saved experiment.",
    );
  const experiment = extension === "fqx";
  if (file.size > (experiment ? MAX_EXPERIMENT_BYTES : MAX_MODEL_BYTES))
    throw Error(
      experiment
        ? "Choose a .fqx experiment no larger than 16 MiB."
        : "Source files must be no larger than 32 KiB. .fqx experiments support up to 16 MiB.",
    );
  return experiment ? "experiment" : extension === "py" ? "python" : "qasm";
}

export async function readModelImport(
  file: Pick<File, "name" | "arrayBuffer">,
) {
  let buffer: ArrayBuffer;
  try {
    buffer = await file.arrayBuffer();
  } catch {
    throw Error(
      "Could not read this file. Select it again or choose a local copy.",
    );
  }
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw Error(
      "This source is not valid UTF-8 text. Save it as UTF-8 and import again.",
    );
  }
  if (source.includes("\0"))
    throw Error(
      "This looks like a binary file. Choose UTF-8 Python or OpenQASM source.",
    );
  if (!source.trim())
    throw Error(
      "No code was found in this file. Choose Python or OpenQASM source containing code.",
    );
  return { source, name: file.name.replace(/\.[^.]+$/, "") || file.name };
}
