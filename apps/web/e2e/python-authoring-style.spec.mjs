import { expect, test } from "@playwright/test";

test("Python classification is per model and does not modify or run code", async ({
  page,
}) => {
  await page.goto("/#model");
  const editor = page.getByRole("textbox", {
    name: "Quantum model code editor",
  });
  const style = page.getByLabel("Python authoring style");
  const language = page.getByRole("group", { name: "Source language" });
  const source =
    "from flagquantum import synth\nprogram = synth.synthesize(fn)\n";
  const runs = async () => {
    const response = await page.request.get("/api/python/runs");
    expect(response.ok()).toBe(true);
    return (await response.json()).map(({ id }) => id).sort();
  };
  const before = await runs();
  await editor.fill(source);
  await expect(style.locator("option:checked")).toHaveText(
    "Auto · High-level synthesis",
  );
  await style.selectOption("gates");
  await expect(
    language.getByRole("button", { name: "Python", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(editor).toHaveValue(source);
  await page.reload();
  await expect(style).toHaveValue("gates");
  await expect(editor).toHaveValue(source);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const library = page.getByRole("region", { name: "My models", exact: true });
  await expect(
    library.getByRole("button", { name: /Python · Gate-level circuit/ }),
  ).toBeVisible();
  await style.selectOption("auto");
  await expect(style.locator("option:checked")).toHaveText(
    "Auto · High-level synthesis",
  );
  await language.getByRole("button", { name: "OpenQASM" }).click();
  await expect(style).toHaveCount(0);
  await language.getByRole("button", { name: "Python", exact: true }).click();
  await expect(editor).toHaveValue(source);
  expect(await runs()).toEqual(before);
});
