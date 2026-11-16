import { expect, test } from "@playwright/test";

const compatible = process.env.FQ_SYNTHESIS_REPORT_SDK === "compatible";

async function get(page, path) {
  const response = await page.request.get(path);
  expect(response.ok()).toBe(true);
  return response.json();
}

async function openAndRun(page, disclosure, button) {
  await page.goto("/#model");
  const draft = "# preserve the existing research draft\nprint(42)\n";
  await page
    .getByRole("textbox", { name: "Quantum model code editor" })
    .fill(draft);
  const ids = new Set(
    (await get(page, "/api/python/runs")).map(({ id }) => id),
  );
  await page.getByRole("button", { name: "SYNTHESIS", exact: true }).click();
  await page.getByText(disclosure, { exact: true }).press("Enter");
  await page.getByRole("button", { name: button, exact: true }).click();
  await expect(page).toHaveURL(/#model$/);
  expect(
    (await get(page, "/api/python/runs")).every(({ id }) => ids.has(id)),
  ).toBe(true);
  await page.getByRole("button", { name: "Run Python", exact: true }).click();
  let run;
  await expect
    .poll(
      async () => {
        const added = (await get(page, "/api/python/runs")).filter(
          ({ id }) => !ids.has(id),
        );
        if (!added.length) return "not submitted";
        expect(added).toHaveLength(1);
        run = await get(page, "/api/python/runs/" + added[0].id);
        return run.status;
      },
      { timeout: 90000 },
    )
    .toBe(compatible ? "completed" : "failed");
  if (!compatible) {
    expect(run.experiments).toEqual([]);
    expect(run.logs.map(({ text }) => text).join("")).toContain(
      "No research code was executed.",
    );
  }
  return { draft, run, ids };
}

async function verifyDraftAndCount(page, draft, ids) {
  await page.reload();
  const retained = await page.evaluate((source) => {
    const saved = JSON.parse(localStorage.getItem("fq-react-workspace-v1"));
    return saved.models.some((model) => model.source === source);
  }, draft);
  expect(retained).toBe(true);
  expect(
    (await get(page, "/api/python/runs")).filter(({ id }) => !ids.has(id)),
  ).toHaveLength(1);
}

async function compareSavedReports(page, left, right) {
  await page.getByRole("button", { name: "JOBS", exact: true }).click();
  await page
    .getByRole("checkbox", { name: `Compare ${left}`, exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: `Compare ${right}`, exact: true })
    .check();
  await page
    .getByRole("button", { name: "Compare 2 / 2", exact: true })
    .click();
  return page.getByRole("region", {
    name: "Synthesis report comparison",
    exact: true,
  });
}

test("synthesis reports show recorded constraints, named outputs and actual resource deltas", async ({
  page,
}) => {
  const { draft, run, ids } = await openAndRun(
    page,
    "Verify synthesis across constraints",
    "Open constraint verification model",
  );
  if (compatible) {
    expect(run.experiments.map(({ filename }) => filename).sort()).toEqual([
      "synth-baseline.fqx",
      "synth-line.fqx",
    ]);
    await page.getByRole("button", { name: "JOBS", exact: true }).click();
    await page
      .getByRole("button", { name: "Open job synth-line", exact: true })
      .click();
    const archive = await get(
      page,
      "/api/experiments/" +
        run.experiments.find(({ filename }) => filename === "synth-line.fqx")
          .id,
    );
    const { experiment } = archive.program;
    expect(experiment.python_run.sdk_code_sha256).toBe(
      experiment.metrics.flagqai_synthesis.sdk_code_sha256,
    );
    const card = page.getByRole("region", {
      name: "Recorded synthesis report",
      exact: true,
    });
    await expect(card).toContainText("Script checks passed");
    await expect(card).toContainText("8 named outcomes");
    await card
      .getByText("Constraints, named outputs and evidence", { exact: true })
      .click();
    await expect(card.getByRole("table").first().getByRole("row")).toHaveCount(
      9,
    );
    const comparison = await compareSavedReports(
      page,
      "synth-baseline",
      "synth-line",
    );
    await expect(comparison).toContainText(
      "Maximum recorded named-probability difference",
    );
    await expect(comparison).toContainText("+113 operations");
    await expect(comparison).toContainText("+61 depth");
  }
  await verifyDraftAndCount(page, draft, ids);
});
