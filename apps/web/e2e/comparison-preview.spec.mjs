import { test, expect } from "@playwright/test";

test("comparison previews retain high-index wires without expanding the whole page", async ({
  page,
}) => {
  await page.goto("/#model");
  const editor = page.getByRole("textbox", {
    name: "Quantum model code editor",
  });
  const draft = "# Keep the current draft\nprint(42)\n";
  await editor.fill(draft);
  // Browser tests share an isolated server; earlier cases may already have runs.
  const initialRuns = await (await page.request.get("/api/python/runs")).json();
  const initialIds = new Set(initialRuns.map((run) => run.id));
  const submitted = await page.request.post("/api/python/runs", {
    data: {
      name: "Wide circuit preview acceptance",
      source: `import flagquantum as fq
for name, wire in (("wide-A", 10), ("wide-B", 11)):
    result = fq.run(fq.Circuit(12).x(wire), outputs=fq.counts(),
                    options=fq.ExecutionOptions(shots=16, seed=42))
    fq.save(name + ".fqx", result.plan, result=result)
`,
    },
  });
  expect(submitted.ok()).toBeTruthy();
  const { id } = await submitted.json();
  let run;
  await expect
    .poll(async () => {
      run = await (await page.request.get("/api/python/runs/" + id)).json();
      return run.collection_status;
    })
    .toBe("completed");
  expect(run.experiments).toHaveLength(2);
  await page.reload();
  await page.getByRole("button", { name: "JOBS", exact: true }).click();
  for (const name of ["wide-A", "wide-B"]) {
    await page
      .getByRole("checkbox", { name: "Compare " + name, exact: true })
      .check();
  }
  await page
    .getByRole("button", { name: "Compare 2 / 2", exact: true })
    .click();
  const comparison = page.getByRole("region", {
    name: "Experiment comparison",
    exact: true,
  });
  for (const [name, wire] of [
    ["wide-A", 10],
    ["wide-B", 11],
  ]) {
    const viewport = comparison.getByRole("region", {
      name: name + " circuit preview viewport",
      exact: true,
    });
    await expect(
      viewport.locator("svg > g > text").filter({ hasText: /^q\d+$/ }),
    ).toHaveCount(12);
    const gate = viewport.getByRole("button", {
      name: "Inspect X gate 1",
      exact: true,
    });
    await expect(gate).toHaveCount(1);
    const bounds = await viewport.evaluate((el) => ({
      height: el.clientHeight,
      total: el.scrollHeight,
    }));
    expect(bounds.height).toBeLessThan(180);
    expect(bounds.total).toBeGreaterThan(bounds.height * 2);
    await viewport.focus();
    await viewport.press("End");
    await expect
      .poll(() => viewport.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
    await expect(
      viewport.getByText("q" + wire, { exact: true }),
    ).toBeInViewport();
    await expect(gate).toBeInViewport();
  }
  await comparison
    .getByRole("button", { name: "Expand circuit previews", exact: true })
    .click();
  await page.reload();
  await expect(
    comparison.getByRole("button", {
      name: "Compact circuit previews",
      exact: true,
    }),
  ).toBeVisible();
  const runs = await (await page.request.get("/api/python/runs")).json();
  expect(
    runs.map((run) => run.id).filter((runId) => !initialIds.has(runId)),
  ).toEqual([id]);
  await page.getByRole("button", { name: "MODEL", exact: true }).click();
  await expect(editor).toHaveValue(draft);
});
