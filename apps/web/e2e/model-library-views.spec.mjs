import { test, expect } from "@playwright/test";

test("library view and creation preserve drafts and never submit work", async ({
  page,
}, testInfo) => {
  await page.goto("/#model");
  const editor = page.getByRole("textbox", {
    name: "Quantum model code editor",
  });
  const draft = "# Keep unsaved research\n";
  await editor.fill("# saved Bell reference\n");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await editor.fill(draft);
  const runs = async () =>
    (await (await page.request.get("/api/python/runs")).json())
      .map((item) => item.id)
      .sort();
  const before = await runs();
  await page.getByRole("button", { name: "Examples", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Examples", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(editor).toHaveValue(draft);
  const search = page.getByRole("textbox", { name: "Search models" });
  await search.fill("Bell");
  await expect(
    page.getByRole("region", { name: "My models", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", {
      name: "FlagQuantum synthesis files",
      exact: true,
    }),
  ).toBeVisible();
  await search.press("Escape");
  await page.getByRole("button", { name: "New Model", exact: true }).click();
  await page
    .getByRole("button", { name: "High-level synthesis", exact: true })
    .click();
  await expect(editor).toHaveValue(/from flagquantum import synth/);
  await expect(page.getByLabel("Python authoring style")).toHaveValue(
    "synthesis",
  );
  const workspace = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("fq-react-workspace-v1")),
  );
  expect(workspace.models.some((model) => model.source === draft)).toBe(true);
  await page.getByRole("button", { name: "My files", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "My files", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(await runs()).toEqual(before);
  await page.setViewportSize({ width: 1024, height: 600 });
  await page.screenshot({ path: testInfo.outputPath("model-library.png") });
});
