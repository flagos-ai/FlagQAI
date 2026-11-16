import { expect, test } from "@playwright/test";

test("scientific grid opens a draft-safe copy and binds resources to real saved runs", async ({
  page,
}) => {
  const compatible = process.env.FQ_SCIENTIFIC_GRID_SDK === "compatible";
  await page.goto("/#model");
  const editor = page.getByRole("textbox", {
    name: "Quantum model code editor",
  });
  const draft = "# keep the original experiment\nprint(5)";
  await editor.fill(draft);
  const get = async (path) => {
    const response = await page.request.get(path);
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const history = () => get("/api/python/runs");
  const originalRuns = await history();
  const jobsBefore = await get("/api/jobs");
  const synthesis = page.getByRole("button", {
    name: "SYNTHESIS",
    exact: true,
  });
  const section = page.getByRole("region", {
    name: "Scientific expression to circuit",
    exact: true,
  });
  const grids = compatible ? [1, 2] : [2];
  const records = [];
  for (const bits of grids) {
    await synthesis.click();
    const disclosure = section.locator("details").first();
    await expect(disclosure).not.toHaveAttribute("open");
    await disclosure.locator(":scope > summary").press("Enter");
    const size = section.getByLabel("Scientific grid size");
    await size.selectOption(String(bits));
    const row = section
      .getByRole("row")
      .filter({ hasText: `${2 ** bits} × ${2 ** bits}` });
    await expect(row).toContainText("No saved run");
    const before = (await history()).map(({ id }) => id);
    await section
      .getByRole("button", { name: `Open ${bits}-bit model` })
      .click();
    await expect(editor).toHaveValue(new RegExp(`BITS = ${bits}`));
    expect((await history()).map(({ id }) => id)).toEqual(before);
    await page.getByRole("button", { name: "Run Python", exact: true }).click();
    let run;
    await expect
      .poll(
        async () => {
          const added = (await history()).filter(
            ({ id }) => !before.includes(id),
          );
          if (!added.length) return "not submitted";
          expect(added).toHaveLength(1);
          run = await get("/api/python/runs/" + added[0].id);
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
    } else {
      expect(run.logs.map(({ text }) => text).join("")).toContain(
        `All ${2 ** (2 * bits)} grid values match the classical potential.`,
      );
      const artifact = run.experiments.find(
        ({ filename }) => filename === `harmonic-grid-${bits}bit.fqx`,
      );
      expect(artifact).toBeTruthy();
      const { program } = await get("/api/experiments/" + artifact.id);
      records.push(program);
      await synthesis.click();
      await section
        .locator("details")
        .first()
        .locator(":scope > summary")
        .click();
      await expect(
        row.getByRole("button", { name: "View circuit" }),
      ).toBeVisible();
      const values = [
        program.compiled.qubits,
        program.compiled.instructions.length,
        program.compiled.depth,
      ];
      await expect(row.getByRole("cell")).toHaveText([
        ...values.map(String),
        "View circuit",
      ]);
      if (bits === 2) {
        expect(program.compiled.qubits).toBeGreaterThan(16);
        await row.getByRole("button", { name: "View circuit" }).click();
        await expect(page).toHaveURL(/#program$/);
        await synthesis.click();
        await section
          .locator("details")
          .first()
          .locator(":scope > summary")
          .click();
        await section
          .getByRole("button", { name: "Compare generated circuits" })
          .click();
        await expect(page).toHaveURL(/#jobs$/);
        await expect(
          page.getByRole("table", { name: "Circuit resource comparison" }),
        ).toBeVisible();
      } else {
        // Return to Model between variants so the Synthesis disclosure resets.
        await page
          .getByRole("button", { name: "Open Python in Model" })
          .click();
      }
    }
  }
  if (compatible)
    expect(records[1].compiled.instructions.length).toBeGreaterThan(
      records[0].compiled.instructions.length,
    );
  await page.reload();
  expect(
    await page.evaluate(
      (source) =>
        JSON.parse(localStorage.getItem("fq-react-workspace-v1")).models.some(
          (model) => model.source === source,
        ),
      draft,
    ),
  ).toBe(true);
  expect(await history()).toHaveLength(originalRuns.length + grids.length);
  // No circuit was submitted to Execution. Python produces archived jobs only.
  const jobsAfter = await get("/api/jobs");
  expect(jobsAfter.filter(({ id }) => !id.startsWith("fqx-")).length).toBe(
    jobsBefore.filter(({ id }) => !id.startsWith("fqx-")).length,
  );
});
