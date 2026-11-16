import snapshot from "../data/synthesis-catalog.json" with { type: "json" };
import acceptance from "../../public/examples/synthesis/acceptance.json" with { type: "json" };
import type { Model } from "../contracts/quantum-workspace";

export interface SynthesisExample {
  id: string;
  category: string;
  name: string;
  path: string;
  readme: string;
  upstreamWorkflowValidated: boolean;
  title?: string;
  purpose?: string;
  source?: string;
  sourceSha256?: string;
  upstreamSha256?: string;
  filename?: string;
  comparison?: string;
  requiredCapabilities?: string[];
}
export const synthesisRevision = snapshot.revision;
export const synthesisAcceptance = acceptance;
export function recordedSynthesisCheck(item: SynthesisExample) {
  return acceptance.revision === synthesisRevision
    ? acceptance.results.find(
        (record) =>
          record.id === item.id &&
          record.sourceSha256 === item.sourceSha256 &&
          record.passed &&
          record.checks.run.passed &&
          record.checks.comparison.passed &&
          record.checks.savedReplay.passed,
      )
    : undefined;
}
export const synthesisExamples: SynthesisExample[] = snapshot.entries;
export const synthesisCategories = [
  "Algorithms",
  "Applications",
  "Community",
  "Functions",
  "Tutorials",
];
export function matchingSynthesisExamples(query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return synthesisExamples.filter((item) =>
    terms.every((term) =>
      `${item.title || ""} ${item.name} ${item.path} ${item.category} ${item.purpose || ""}`
        .toLowerCase()
        .includes(term),
    ),
  );
}
export function synthesisExampleCopy(
  item: SynthesisExample,
  models: Model[],
): Model {
  if (!item.source)
    throw new Error("This example has not been integrated into the workbench.");
  const base = `${item.title || item.name} · copy`;
  let name = base;
  for (let suffix = 2; models.some((model) => model.name === name); suffix++)
    name = `${base} ${suffix}`;
  return {
    name,
    source: item.source,
    language: "python",
  };
}
export interface ExampleFolder {
  name: string;
  path: string;
  children: ExampleFolder[];
  entries: SynthesisExample[];
  count: number;
}
export function synthesisExampleTree(
  entries: SynthesisExample[],
): ExampleFolder[] {
  const roots: ExampleFolder[] = [];
  for (const item of entries) {
    let nodes = roots;
    let prefix = "";
    for (const segment of item.path.split("/").slice(0, -1)) {
      prefix += (prefix ? "/" : "") + segment;
      let node = nodes.find((candidate) => candidate.path === prefix);
      if (!node) {
        node = {
          name: segment.replaceAll("_", " "),
          path: prefix,
          children: [],
          entries: [],
          count: 0,
        };
        nodes.push(node);
      }
      node.count++;
      if (prefix === item.path.split("/").slice(0, -1).join("/"))
        node.entries.push(item);
      nodes = node.children;
    }
  }
  return roots.sort(
    (a, b) =>
      synthesisCategories.indexOf(a.name[0].toUpperCase() + a.name.slice(1)) -
      synthesisCategories.indexOf(b.name[0].toUpperCase() + b.name.slice(1)),
  );
}
