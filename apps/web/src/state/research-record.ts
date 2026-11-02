import type { PythonRun } from "../api/python-runs";
import type { ExperimentImport } from "../contracts/quantum-workspace";
import { qaoaFiles, qaoaOutcome } from "./qaoa-outcome.ts";
import { iterationFromSource, compareQaoaVersions } from "./qaoa-iteration.ts";
export type ResearchTurn = {
  goal: string;
  runs: string[];
  candidates?: string[];
  active?: boolean;
  outcome?: string;
};
export type ResearchEntry = {
  id: string;
  run?: PythonRun;
  summary?: Awaited<ReturnType<typeof qaoaOutcome>>;
  parent?: string;
  issue?: string;
};
export type ResearchRecord = {
  root: string;
  rootSource: string;
  goal: string;
  turns: ResearchTurn[];
  entries: ResearchEntry[];
  notices: string[];
};
export type ResearchAdoption = {
  run: string;
  source: string;
  archive: string;
  sha256: string;
  reason: string;
};
type Readers = {
  run: (id: string) => Promise<PythonRun>;
  experiment: (id: string) => Promise<ExperimentImport>;
};
export async function loadResearchRecord(
  selected: string,
  turns: ResearchTurn[],
  readers: Readers,
): Promise<ResearchRecord> {
  const runCache = new Map<string, Promise<PythonRun>>(),
    summaries = new Map<
      string,
      Promise<Awaited<ReturnType<typeof qaoaOutcome>> | undefined>
    >();
  let limitReached = false;
  const read = (id: string) => {
    if (!runCache.has(id) && runCache.size >= 64) {
      limitReached = true;
      return Promise.reject<PythonRun>(
        Error("Research read limit reached; this snapshot is incomplete."),
      );
    }
    if (!runCache.has(id))
      runCache.set(
        id,
        readers.run(id).then((run) => {
          if (run.id !== id) throw Error("Run identity did not match.");
          return run;
        }),
      );
    return runCache.get(id)!;
  };
  const summary = (run: PythonRun) => {
    if (!summaries.has(run.id))
      summaries.set(
        run.id,
        (async () => {
          if (!run.experiments?.some((e) => e.filename === qaoaFiles[1]))
            return undefined;
          const refs = qaoaFiles.map((filename) =>
            run.experiments?.find((e) => e.filename === filename),
          );
          if (refs.some((ref) => !ref))
            throw Error("The saved QAOA archive set is incomplete.");
          return qaoaOutcome(
            run,
            await Promise.all(refs.map((ref) => readers.experiment(ref!.id))),
          );
        })(),
      );
    return summaries.get(run.id)!;
  };
  const parentOf = async (run: PythonRun) => {
    const ref = iterationFromSource(run.source);
    if (!ref) return undefined;
    const parent = await read(ref.run),
      base = await summary(parent);
    if (
      !base ||
      parent.id === run.id ||
      base.sourceHash !== ref.source ||
      base.records[1].id !== ref.archive ||
      base.records[1].program.experiment!.sha256 !== ref.sha256
    )
      throw Error(
        "Iteration baseline identity does not match its saved evidence.",
      );
    const current = await summary(run);
    if (current) compareQaoaVersions(ref, parent, base, run, current);
    return parent.id;
  };
  const chain = new Set<string>();
  let root = selected;
  for (let depth = 0; ; depth++) {
    if (depth >= 16 || chain.has(root))
      throw Error("Research lineage is cyclic or exceeds 16 versions.");
    chain.add(root);
    const parent = await parentOf(await read(root));
    if (!parent) break;
    root = parent;
  }
  const rootRun = await read(root),
    rootSummary = await summary(rootRun);
  if (!rootSummary)
    throw Error("The research baseline has no verified QAOA evidence.");
  const allIds = [
      ...new Set([
        ...chain,
        ...turns.flatMap((t) => [...t.runs, ...(t.candidates || [])]),
      ]),
    ],
    notices: string[] = [];
  const bounded = allIds.slice(0, 64);
  if (allIds.length > 64)
    notices.push(
      "Only the first 64 referenced runs are included in this snapshot.",
    );
  const entries = await Promise.all(
    bounded.map(async (id): Promise<ResearchEntry> => {
      try {
        const run = await read(id);
        let parent: string | undefined, issue: string | undefined;
        try {
          parent = await parentOf(run);
        } catch (error) {
          issue = String(error);
        }
        let data: Awaited<ReturnType<typeof qaoaOutcome>> | undefined;
        try {
          data = await summary(run);
        } catch (error) {
          issue = issue || String(error);
        }
        return { id, run, parent, summary: issue ? undefined : data, issue };
      } catch (error) {
        return { id, issue: String(error) };
      }
    }),
  );
  if (limitReached)
    notices.push(
      "The 64-run read limit was reached; some lineage is unavailable in this snapshot.",
    );
  const included = new Set(chain);
  let changed = true;
  while (changed) {
    const size = included.size;
    for (const turn of turns)
      if (turn.runs.some((id) => included.has(id)))
        for (const id of turn.runs) included.add(id);
    for (const entry of entries)
      if (entry.parent && included.has(entry.parent)) included.add(entry.id);
    changed = included.size !== size;
  }
  const relevant = entries.filter((e) => included.has(e.id));
  relevant.sort(
    (a, b) =>
      (a.run?.created_at ?? Infinity) - (b.run?.created_at ?? Infinity) ||
      a.id.localeCompare(b.id),
  );
  for (const entry of relevant)
    if (entry.summary && entry.summary.graph !== rootSummary.graph) {
      entry.issue =
        "Graph differs from the research baseline; this result cannot be adopted or compared as the same objective.";
      entry.summary = undefined;
    }
  const relevantTurns = turns
    .filter((t) => t.runs.some((id) => included.has(id)))
    .map((turn) => ({
      ...turn,
      runs: turn.runs.filter((id) => included.has(id)),
      candidates: turn.candidates?.filter((id) => included.has(id)),
    }));
  const goal =
    turns.find((t) => t.runs.includes(root))?.goal ||
    "Original request is unavailable in this conversation snapshot.";
  if (!turns.some((t) => t.runs.includes(root)))
    notices.push(
      "The original conversation context is unavailable; saved run evidence is still shown.",
    );
  return {
    root,
    rootSource: rootSummary.sourceHash,
    goal,
    turns: relevantTurns,
    entries: relevant,
    notices,
  };
}
export function validAdoption(
  record: ResearchRecord,
  value: unknown,
): value is ResearchAdoption {
  const v = value as ResearchAdoption,
    entry = record.entries.find((e) => e.id === v?.run),
    s = entry?.summary;
  return (
    !!s &&
    s.replayMatches &&
    typeof v.reason === "string" &&
    v.reason.length <= 1000 &&
    v.source === s.sourceHash &&
    v.archive === s.records[1].id &&
    v.sha256 === s.records[1].program.experiment!.sha256
  );
}
export function adoptionFor(
  entry: ResearchEntry,
  reason: string,
): ResearchAdoption {
  if (!entry.summary || !entry.summary.replayMatches)
    throw Error("Only a version with verified saved evidence can be adopted.");
  const s = entry.summary;
  return {
    run: entry.id,
    source: s.sourceHash,
    archive: s.records[1].id,
    sha256: s.records[1].program.experiment!.sha256,
    reason: reason.slice(0, 1000),
  };
}
export function researchManifest(
  record: ResearchRecord,
  adopted: ResearchAdoption | null,
) {
  return {
    schema: "flagqai.research-record.v1",
    exported_at: new Date().toISOString(),
    root_run: record.root,
    root_source_sha256: record.rootSource,
    goal: record.goal,
    turns: record.turns,
    notices: record.notices,
    adopted: adopted && validAdoption(record, adopted) ? adopted : null,
    model_cost: null,
    runs: record.entries.map((e) => ({
      id: e.id,
      parent: e.parent,
      status: e.run?.status || "unavailable",
      collection_status: e.run?.collection_status,
      issue: e.issue,
      source: e.run?.source,
      source_sha256: e.run?.source_hash,
      compute_seconds: e.run?.elapsed_seconds,
      summary: e.summary
        ? {
            graph: JSON.parse(e.summary.graph),
            classical_optimum: e.summary.optimum,
            baseline_expected_cut: e.summary.baseline.expected,
            baseline_sampled_optimum_rate: e.summary.baseline.hit,
            expected_cut: e.summary.optimized.expected,
            sampled_optimum_rate: e.summary.optimized.hit,
            replay_matches: e.summary.replayMatches,
            shots: e.summary.optimized.shots,
            seed: e.summary.optimized.seed,
            backend: e.summary.backend,
            device: e.summary.device,
            depth: e.summary.records[1].program.compiled.depth,
            gates: e.summary.records[1].program.compiled.instructions.length,
          }
        : null,
      artifacts: e.run?.experiments || [],
      error: e.run?.error,
      failure_output:
        e.run && ["failed", "cancelled", "timed_out"].includes(e.run.status)
          ? e.run.logs
              .map((log) => log.text)
              .join("")
              .slice(-8000)
          : undefined,
      failure_output_truncated:
        e.run && ["failed", "cancelled", "timed_out"].includes(e.run.status)
          ? e.run.logs.reduce((n, log) => n + log.text.length, 0) > 8000
          : undefined,
    })),
  };
}
