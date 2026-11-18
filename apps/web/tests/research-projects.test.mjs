import test from "node:test";
import assert from "node:assert/strict";
import { researchProjects } from "../src/state/research-projects.ts";
const run = (letter, project, date, status = "completed") => ({
  id: "invsqrt-" + letter.repeat(32),
  project: { id: project, name: project },
  created_at: date,
  status,
  title: letter,
  summary: "Saved record",
});
test("workspace research groups retain failures and choose the newest attempt rather than a baseline claim", () => {
  const older = run("a", "arithmetic", "2026-11-01T00:00:00Z");
  const failed = run("b", "arithmetic", "2026-11-03T00:00:00Z", "failed");
  const other = run("c", "dynamics", "2026-11-02T00:00:00Z", "review");
  const records = [older, other, failed],
    snapshot = structuredClone(records);
  const projects = researchProjects(records);
  assert.deepEqual(
    projects.map((p) => [p.id, p.count, p.latest.id, p.latest.status]),
    [
      ["arithmetic", 2, failed.id, "failed"],
      ["dynamics", 1, other.id, "review"],
    ],
  );
  assert.deepEqual(records, snapshot);
});
test("workspace research ordering is deterministic and invalid navigation identities are excluded", () => {
  const a = run("a", "study", "2026-11-01T00:00:00Z"),
    b = run("b", "study", a.created_at);
  assert.equal(researchProjects([a, b])[0].latest.id, b.id);
  assert.deepEqual(researchProjects([b, a]), researchProjects([a, b]));
  assert.deepEqual(
    researchProjects([
      { ...a, id: "../../source" },
      { ...b, project: { id: "", name: "Missing" } },
    ]),
    [],
  );
  assert.deepEqual(researchProjects([]), []);
});
