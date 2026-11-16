import { expect, test } from "@playwright/test";

test("organizes saved models without changing the active draft or submitting work", async ({
  page,
}) => {
  await page.goto("/#model");
  const editor = page.getByRole("textbox", {
    name: "Quantum model code editor",
  });
  const saved = "# saved candidate\nprint(42)\n";
  const draft = "# active draft\nprint(43)\n";
  const runs = async () => {
    const response = await page.request.get("/api/python/runs");
    expect(response.ok()).toBe(true);
    return (await response.json()).map(({ id }) => id).sort();
  };
  const before = await runs();
  await editor.fill(saved);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await editor.fill(draft);
  const models = page.getByRole("region", { name: "My models", exact: true });
  await models.getByRole("button", { name: "New model folder" }).click();
  const path = models.getByLabel("Model folder path", { exact: true });
  await path.fill("../Outside");
  await models.getByRole("button", { name: "Create", exact: true }).click();
  await expect(models.getByRole("alert")).toContainText("folder names");
  await path.fill("Research / Arithmetic");
  await models.getByRole("button", { name: "Create", exact: true }).click();
  const folder = models.getByRole("button", { name: /^Research/ });
  await expect(folder).toHaveAttribute("aria-expanded", "true");
  const move = models.getByRole("button", {
    name: "Move to folder",
    exact: true,
  });
  await move.focus();
  await page.keyboard.press("Enter");
  await path.fill("Research/Arithmetic");
  await models.getByRole("button", { name: "Move", exact: true }).click();
  await expect(editor).toHaveValue(draft);
  await expect(folder).toHaveAccessibleName("Research 1");
  await folder.click();
  await expect(move).toHaveCount(0);
  const search = page.getByRole("textbox", { name: "Search models" });
  await search.fill("research/arithmetic");
  await expect(move).toBeVisible();
  await search.press("Escape");
  await expect(folder).toHaveAttribute("aria-expanded", "false");
  await page.reload();
  await expect(editor).toHaveValue(draft);
  await expect(folder).toHaveAttribute("aria-expanded", "false");
  await folder.focus();
  await page.keyboard.press("Enter");
  const file = models
    .locator(".fq-model-folder-file")
    .getByRole("button")
    .first();
  await file.click();
  await expect(editor).toHaveValue(saved);
  const snapshot = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("fq-react-workspace-v1")),
  );
  expect(snapshot.models).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ source: draft }),
      expect.objectContaining({ source: saved, folder: "Research/Arithmetic" }),
    ]),
  );
  expect(await runs()).toEqual(before);
});
