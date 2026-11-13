import { test, expect } from "@playwright/test";

const source = `import flagquantum as fq
EDGES = [(0, 1, 2)]
for label, beta in [("baseline", 0.2), ("variant", 0.5)]:
    circuit = fq.Circuit(2).h(0).h(1).cx(0, 1).rz(1, 0.7).cx(0, 1).rx(0, beta).rx(1, beta)
    result = fq.run(circuit, outputs=[fq.probabilities(), fq.counts()], options=fq.ExecutionOptions(device="cpu", backend="pytorch", shots=128, seed=42))
    fq.save(label + ".fqx", result.plan, result=result)
`;
const editor = (page) =>
  page.getByRole("textbox", { name: "Quantum model code editor" });
async function read(page, path) {
  const response = await page.request.get(path);
  expect(response.ok()).toBeTruthy();
  return response.json();
}
const number = (value) => Number(value.toPrecision(6)).toString();

test("real QAOA metrics compare saved versions and preserve drafts on refresh", async ({
  page,
}, testInfo) => {
  await page.goto("/#model");
  const draft = "# Keep my unsaved research draft\nprint('retain')\n";
  await editor(page).fill(draft);
  const agent = page.getByRole("button", {
    name: "FlagQAI Agent",
    exact: true,
  });
  if ((await agent.getAttribute("aria-expanded")) !== "true")
    await agent.click();
  const chat = page.getByRole("textbox", {
    name: "Message FlagQAI",
    exact: true,
  });
  await chat.fill("Keep my next research question");
  await agent.click();

  const submitted = await page.request.post("/api/python/runs", {
    data: { source, name: "QAOA metric comparison" },
  });
  expect(submitted.ok()).toBeTruthy();
  const started = await submitted.json();
  let run;
  await expect
    .poll(async () => {
      run = await read(page, "/api/python/runs/" + started.id);
      return run.collection_status;
    })
    .toBe("completed");
  expect(run.status).toBe("completed");
  const records = await Promise.all(
    ["baseline.fqx", "variant.fqx"].map(async (filename) => {
      const ref = run.experiments.find((item) => item.filename === filename);
      expect(ref).toBeTruthy();
      return read(page, "/api/experiments/" + ref.id);
    }),
  );
  const reports = records.map((r) => r.program.experiment.research_result);
  expect(reports.every(Boolean)).toBe(true);
  const objectives = reports.map(
    (r) => r.metrics.find((m) => m.key === "expected_cut").value,
  );
  const before = (await read(page, "/api/python/runs")).map((r) => r.id);
  await page.getByRole("button", { name: "JOBS", exact: true }).click();
  for (const record of records)
    await page
      .getByRole("checkbox", {
        name: "Compare " + record.job.name,
        exact: true,
      })
      .check();
  await page
    .getByRole("button", { name: "Compare 2 / 2", exact: true })
    .click();
  const view = page.getByRole("region", {
    name: "Research metrics and resource cost",
    exact: true,
  });
  const row = view.getByRole("row", { name: /Expected cut/ });
  await expect(row).toContainText(number(objectives[0]));
  await expect(row).toContainText(number(objectives[1]));
  await expect(row).toContainText(number(objectives[1] - objectives[0]));
  await expect(view).toContainText("Observed change · significance not tested");
  await expect(view).toContainText("Shared run total · not per candidate");
  await view
    .getByText("Parameters, code versions and evidence", { exact: true })
    .click();
  await expect(view).toContainText(run.source_hash);
  for (const report of reports)
    await expect(view).toContainText(report.binding.archive_sha256);
  await page.screenshot({
    path: testInfo.outputPath("qaoa-metric-comparison.png"),
    fullPage: true,
  });
  await page.reload();
  await expect(row).toContainText(number(objectives[1] - objectives[0]));
  await page
    .getByRole("button", { name: "Swap comparison sides", exact: true })
    .click();
  await expect(row).toContainText(number(objectives[0] - objectives[1]));
  await page.setViewportSize({ width: 820, height: 700 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("qaoa-metric-comparison-narrow.png"),
    fullPage: true,
  });
  expect((await read(page, "/api/python/runs")).map((r) => r.id)).toEqual(
    before,
  );
  await page.getByRole("button", { name: "MODEL", exact: true }).click();
  await expect(editor(page)).toHaveValue(draft);
  if ((await agent.getAttribute("aria-expanded")) !== "true")
    await agent.click();
  await expect(chat).toHaveValue("Keep my next research question");
});
