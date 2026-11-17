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
    const results = page.getByRole("region", {
      name: "Experiment comparison",
      exact: true,
    });
    await expect(
      results.getByText(
        "See the synthesis report for the recorded named probabilities.",
        { exact: false },
      ),
    ).toBeVisible();
    await expect(
      results.getByRole("combobox", {
        name: /^(Baseline|Variant) measurement$/,
      }),
    ).toHaveCount(0);
    await expect(
      results.getByText("No non-empty counts batch saved."),
    ).toHaveCount(0);
    const jobsBefore = (await get(page, "/api/jobs")).map(({ id }) => id);
    await page.getByRole("button", { name: "QUANTUM", exact: true }).click();
    await page
      .getByRole("button", {
        name: `Open quantum program ${archive.program.name}`,
        exact: true,
      })
      .click();
    await page.getByRole("button", { name: "Run again", exact: true }).click();
    await expect(
      page.getByRole("combobox", { name: "Execution circuit", exact: true }),
    ).toHaveValue(archive.id);
    const source = page.getByRole("region", { name: "Execution source" });
    await expect(source).toContainText("this circuit’s OpenQASM");
    await expect(source).toContainText(
      "To change synthesis constraints, synthesize again from the original Python source.",
    );
    expect((await get(page, "/api/jobs")).map(({ id }) => id)).toEqual(
      jobsBefore,
    );
  }
  await verifyDraftAndCount(page, draft, ids);
});

test("compiler optimization reports a verified no-gain result under the pinned SDK", async ({
  page,
}) => {
  const { draft, run, ids } = await openAndRun(
    page,
    "Verify a compiler optimization",
    "Open optimization model",
  );
  if (compatible) {
    expect(run.experiments.map(({ filename }) => filename).sort()).toEqual([
      "optimization-baseline.fqx",
      "optimization-candidate.fqx",
    ]);
    await page.getByRole("button", { name: "SYNTHESIS", exact: true }).click();
    await page
      .getByText("Verify a compiler optimization", { exact: true })
      .press("Enter");
    await page
      .getByRole("button", {
        name: "Compare saved optimization pair",
        exact: true,
      })
      .click();
    const comparison = page.getByRole("region", {
      name: "Synthesis report comparison",
      exact: true,
    });
    await expect(comparison).toContainText("No resource improvement");
    await expect(comparison).toContainText(
      "Script verified the prepared state and replay",
    );
    await page
      .getByRole("button", { name: "Swap comparison sides", exact: true })
      .click();
    await expect(comparison).toContainText("No resource improvement");
  }
  await verifyDraftAndCount(page, draft, ids);
});
