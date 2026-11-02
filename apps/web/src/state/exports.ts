import type {
  ProgramSnapshot,
  QuantumJob,
} from "../contracts/quantum-workspace";
import { jobCounts } from "./job-presentation.ts";
export function download(name: string, data: string, type = "text/plain") {
  const link = document.createElement("a"),
    url = URL.createObjectURL(new Blob([data], { type }));
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportNotebook(
  program: ProgramSnapshot,
  shots: number,
  seed: number,
) {
  const python = `import flagquantum as fq\n\nsource = ${JSON.stringify(program.source)}\nprogram = fq.from_openqasm(source).to_circuit()\ncompiled = fq.compile(program)\nresult = fq.run(compiled, outputs=fq.counts(), options=fq.ExecutionOptions(shots=${shots}, seed=${seed}))\nprint(result.measurements[0].value)\nfq.save("experiment.fqx", result.plan, result=result)\n`;
  download(
    program.name + ".ipynb",
    JSON.stringify(
      {
        nbformat: 4,
        nbformat_minor: 5,
        metadata: {
          kernelspec: {
            display_name: "Python 3",
            language: "python",
            name: "python3",
          },
        },
        cells: [
          {
            cell_type: "markdown",
            metadata: {},
            source: ["# " + program.name + "\n"],
          },
          {
            cell_type: "code",
            metadata: {},
            execution_count: null,
            outputs: [],
            source: python.split(/(?<=\n)/),
          },
        ],
      },
      null,
      2,
    ),
    "application/x-ipynb+json",
  );
}
export function jobCSV(job: QuantumJob) {
  if (!job.result) return "";
  const result = job.result,
    registers = result.registers || [],
    rows =
      result.decoded ||
      Object.entries(result.counts).map(([state, count]) => ({
        state,
        count,
        values: {} as Record<string, number>,
      }));
  return [
    ["state", ...registers.map((r) => r.name), "count", "probability"].join(
      ",",
    ),
    ...rows.map((r) =>
      [
        r.state,
        ...registers.map((v) => r.values[v.name]),
        r.count,
        Number.isFinite(result.shots) && result.shots > 0
          ? r.count / result.shots
          : "",
      ].join(","),
    ),
  ].join("\n");
}
/** Archived batches have their own qubit/key order; never reuse legacy decoding. */
export function jobMeasurementCSV(job: QuantumJob, measurement = 0, batch = 0) {
  if (!job.experiment || !job.result) return jobCSV(job);
  const counts = jobCounts(job, measurement, batch);
  return jobCSV({
    ...job,
    result: {
      ...job.result,
      counts,
      shots: Object.values(counts).reduce((sum, count) => sum + count, 0),
      decoded: undefined,
      registers: [],
    },
  });
}
