import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("Jobs reads the full saved sample tensor with its recorded wire order", async ({
  page,
}) => {
  await page.goto("/#model");
  const editor = page.getByRole("textbox", {
    name: "Quantum model code editor",
  });
  const draft = "# Keep this draft\nprint(42)\n";
  await editor.fill(draft);
  // Browser tests share an isolated server; earlier cases may already have runs.
  const initialRuns = await (await page.request.get("/api/python/runs")).json();
  const initialIds = new Set(initialRuns.map((run) => run.id));
  const submit = await page.request.post("/api/python/runs", {
    data: {
      name: "Saved samples acceptance",
      source: `import flagquantum as fq
result = fq.run(fq.Circuit(3).x(2), outputs=fq.samples([2, 0]),
                options=fq.ExecutionOptions(shots=1024, seed=42))
fq.save("ordered-shots.fqx", result.plan, result=result)
`,
    },
  });
  expect(submit.ok()).toBeTruthy();
  const { id } = await submit.json();
  let run;
  await expect
    .poll(async () => {
      run = await (await page.request.get("/api/python/runs/" + id)).json();
      return run.collection_status;
    })
    .toBe("completed");
  expect(run.collection_errors || []).toEqual([]);
  const record = await (
    await page.request.get("/api/experiments/" + run.experiments[0].id)
  ).json();
  expect(record.job.experiment.measurements[0].value.truncated).toBe(true);
  expect(record.job.experiment.measurements[0].batches).toEqual([
    [{ state: "10", key_type: "string", count: 1024 }],
  ]);
  await page.reload();
  await page.getByRole("button", { name: "JOBS", exact: true }).click();
  await page
    .getByRole("button", { name: "Open job ordered-shots", exact: true })
    .click();
  const results = page.getByRole("region", {
    name: "Job results",
    exact: true,
  });
  await expect(results).toContainText("Qubit order: [2, 0]");
  await expect(results.getByText("10", { exact: true }).first()).toBeVisible();
  await expect(results).not.toContainText("No counts distribution");
  await results
    .getByRole("button", { name: "Export results", exact: true })
    .click();
  const download = page.waitForEvent("download");
  await results
    .getByRole("button", { name: "CSV · selected measurement", exact: true })
    .click();
  expect(await readFile(await (await download).path(), "utf8")).toMatch(
    /^10,1024(?:,|$)/m,
  );
  await page.reload();
  await expect(results).toContainText("Qubit order: [2, 0]");
  const runs = await (await page.request.get("/api/python/runs")).json();
  expect(
    runs.map((run) => run.id).filter((runId) => !initialIds.has(runId)),
  ).toEqual([id]);
  await page.getByRole("button", { name: "MODEL", exact: true }).click();
  await expect(editor).toHaveValue(draft);
});
