import { test, expect } from "@playwright/test";

test("official synthesis copies preserve drafts and report the selected SDK's actual readiness", async ({
  page,
}, testInfo) => {
  const compatible = process.env.FQ_SYNTH_CATALOG_SDK === "compatible";
  const get = async (path) => {
    const response = await page.request.get(path);
    expect(response.ok()).toBeTruthy();
    return response.json();
  };
  await page.goto("/#model");
  const editor = page.getByRole("textbox", {
    name: "Quantum model code editor",
  });
  const draft = '# keep my unsaved research\nprint("draft")\n';
  await editor.fill(draft);
  const builderRuns = new Set(
    (await get("/api/python/runs")).map((run) => run.id),
  );
  const library = page.getByRole("region", {
    name: "Synthesis examples",
    exact: true,
  });
  const shelf = library.locator(".fq-synthesis-shelf");
  const catalog = library.locator(".fq-synthesis-catalog");
  const featured = library.locator(".fq-synthesis-featured");
  const starters = library.locator(".fq-synthesis-starters");
  await expect(shelf).not.toHaveAttribute("open");
  await expect(starters).toHaveCount(0);
  await shelf.locator(":scope > summary").focus();
  await page.keyboard.press("Enter");
  await expect(starters.getByRole("button")).toHaveCount(3);
  await expect(catalog).not.toHaveAttribute("open");
  await featured.locator(":scope > summary").click();
  await expect(featured.getByRole("button")).toHaveCount(7);
  await page.reload();
  await expect(shelf).toHaveAttribute("open");
  await expect(featured).toHaveAttribute("open");
  await expect(editor).toHaveValue(draft);

  const search = page.getByRole("textbox", {
    name: "Search models",
    exact: true,
  });
  await search.fill("chemistry");
  const reference = catalog.getByRole("link", {
    name: /molecular energy curve/,
  });
  await expect(reference).toBeVisible();
  await expect(reference).toHaveAttribute(
    "href",
    /github\.com\/flagos-ai\/FlagQuantum\/blob\/b3fa4a7/,
  );
  await expect(editor).toHaveValue(draft);
  await search.fill("");
  await expect(catalog).not.toHaveAttribute("open");
  expect(
    (await get("/api/python/runs")).every(({ id }) => builderRuns.has(id)),
  ).toBe(true);

  const acceptance = await get("/examples/synthesis/acceptance.json");
  await search.fill("Quantum Fourier");
  await starters
    .getByRole("button", { name: /Quantum Fourier transform/ })
    .click();
  const code = await editor.inputValue();
  expect(code).toMatch(/Source revision: b3fa4a7/);
  expect(code).toMatch(/fq.save\("qft.fqx"/);
  expect(code).not.toMatch(/_missing|hasattr\(_synth/);
  const { createHash } = await import("node:crypto");
  const report = acceptance.results.find(({ id }) => id === "functions/qft");
  expect(createHash("sha256").update(code).digest("hex")).toBe(
    report.sourceSha256,
  );
  await expect(
    page.getByText("No models match your search.", { exact: false }),
  ).toHaveCount(0);
  await search.fill("");
  await expect(
    page
      .getByRole("region", { name: "My models", exact: true })
      .getByRole("button", { name: /Python Bell pair/ }),
  ).toBeVisible();
  expect(
    (await get("/api/python/runs")).every(({ id }) => builderRuns.has(id)),
  ).toBe(true);

  await page.getByRole("button", { name: /^(Run Python|Save & run)$/ }).click();
  let run;
  await expect
    .poll(
      async () => {
        const created = (await get("/api/python/runs")).filter(
          ({ id }) => !builderRuns.has(id),
        );
        if (!created.length) return "not submitted";
        expect(created).toHaveLength(1);
        run = await get("/api/python/runs/" + created[0].id);
        return run.status;
      },
      { timeout: 90000 },
    )
    .toBe(compatible ? "completed" : "failed");
  expect(run.source_hash).toBeTruthy();
  if (compatible) {
    expect(run.experiments.map((item) => item.filename)).toContain("qft.fqx");
  } else {
    expect(run.logs.map((entry) => entry.text).join("")).toContain(
      "No research code was executed.",
    );
    expect(run.experiments).toEqual([]);
  }
  await page.reload();
  await expect(editor).toHaveValue(code);
  expect(
    await page.evaluate(
      (old) =>
        JSON.parse(localStorage.getItem("fq-react-workspace-v1")).models.some(
          (model) => model.source === old,
        ),
      draft,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("official-synthesis-examples.png"),
  });
});
