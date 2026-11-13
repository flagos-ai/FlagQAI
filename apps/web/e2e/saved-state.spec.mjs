import { test, expect } from "@playwright/test";

async function get(page, path) {
  const response = await page.request.get(path);
  expect(response.ok()).toBeTruthy();
  return response.json();
}

test("complete saved state probabilities survive paging, switching, legacy reads and refresh without rerunning", async ({
  page,
}, testInfo) => {
  await page.goto("/#model");
  const editor = page.getByRole("textbox", {
    name: "Quantum model code editor",
  });
  const draft = "# Keep my unsaved research draft\nprint('retain')\n";
  await editor.fill(draft);
  const response = await page.request.post("/api/python/runs", {
    data: {
      name: "Saved state probability acceptance",
      source: `from dataclasses import replace
import torch
import flagquantum as fq
result = fq.run(fq.Circuit(16).x(0).h(15).cx(15,14))
fq.save("sparse16.fqx", result.plan, result=result)
circuit = fq.Circuit(9)
for qubit in range(9):
    circuit.h(qubit)
result = fq.run(circuit)
fq.save("uniform9.fqx", result.plan, result=result)
nonunit = replace(result, state=torch.full((1,512), 0.1, dtype=torch.float64))
fq.save("nonunit9.fqx", nonunit.plan, result=nonunit)
`,
    },
  });
  expect(response.ok()).toBeTruthy();
  const submitted = await response.json();
  let run;
  await expect
    .poll(async () => {
      run = await get(page, "/api/python/runs/" + submitted.id);
      return run.collection_status;
    })
    .toBe("completed");
  expect(run.status).toBe("completed");
  expect(run.collection_errors || []).toEqual([]);
  const records = await Promise.all(
    run.experiments.map(({ id }) => get(page, "/api/experiments/" + id)),
  );
  const sparse = records.find(
    (record) => record.program.experiment.filename === "sparse16.fqx",
  );
  const uniform = records.find(
    (record) => record.program.experiment.filename === "uniform9.fqx",
  );
  const nonunit = records.find(
    (record) => record.program.experiment.filename === "nonunit9.fqx",
  );
  expect(sparse.program.experiment.state.truncated).toBe(true);
  expect(
    sparse.program.experiment.state.values.every(
      ([real, imaginary]) => real === 0 && imaginary === 0,
    ),
  ).toBe(true);
  expect(sparse.job.result.counts).toEqual({});
  const before = (await get(page, "/api/python/runs")).map((run) => run.id);
  // Simulate a previously persisted library whose sparse record predates the
  // complete-state projection. Opening it must read the archive endpoint.
  for (const endpoint of ["/api/experiments", "/api/jobs"]) {
    await page.route("**" + endpoint, async (route) => {
      const rows = structuredClone(
        endpoint === "/api/experiments"
          ? records
          : records.map((record) => record.job),
      );
      for (const row of rows) {
        if (row.id !== sparse.id) continue;
        if (row.program?.experiment)
          delete row.program.experiment.state_distribution;
        if (row.job?.experiment) delete row.job.experiment.state_distribution;
        if (row.experiment) delete row.experiment.state_distribution;
      }
      await route.fulfill({ json: rows });
    });
  }
  await page.reload();
  await page.getByRole("button", { name: "JOBS", exact: true }).click();
  const result = page.getByRole("region", {
    name: "Saved statevector probabilities",
    exact: true,
  });
  async function open(record) {
    await page
      .getByRole("button", { name: "Open job " + record.job.name, exact: true })
      .click();
  }
  await open(uniform);
  await expect(result.getByRole("row")).toHaveCount(33);
  await expect(result).toContainText("Showing 1–32 of 512 states");
  await expect(result).toContainText("50.00% probability outside this preview");
  for (let pageIndex = 1; pageIndex < 8; pageIndex++) {
    await result.getByRole("button", { name: "Next", exact: true }).click();
  }
  await expect(result).toContainText("Showing 225–256 of 512 states");
  await expect(
    result.getByRole("button", { name: "Next", exact: true }),
  ).toBeDisabled();
  const restored = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/experiments/" + sparse.id &&
      response.request().method() === "GET",
  );
  await open(sparse);
  expect((await restored).ok()).toBeTruthy();
  await expect(result.getByRole("row")).toHaveCount(3);
  await expect(result).toContainText("1000000000000000");
  await expect(result).toContainText("1000000000000011");
  await expect(result.getByText("50.0000%", { exact: true })).toHaveCount(2);
  await expect(
    page.getByText("No counts distribution", { exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("saved-state-probabilities.png"),
    fullPage: true,
  });
  await open(nonunit);
  await expect(result).toContainText("Saved probability sum: 5.1200000");
  await expect(result).toContainText("without renormalization");
  await expect(result).toContainText("Showing 1–32 of 512 states");
  await expect(result.getByText("1.00000%", { exact: true })).toHaveCount(32);
  await open(sparse);
  await page.reload();
  await expect(result).toContainText("1000000000000011");
  expect((await get(page, "/api/python/runs")).map((run) => run.id)).toEqual(
    before,
  );
  const reopened = await get(page, "/api/experiments/" + sparse.id);
  expect(reopened.program.experiment.sha256).toBe(
    sparse.program.experiment.sha256,
  );
  expect(reopened.job.result.counts).toEqual({});
  await page.getByRole("button", { name: "MODEL", exact: true }).click();
  await expect(editor).toHaveValue(draft);
});
