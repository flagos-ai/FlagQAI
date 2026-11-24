import { test, expect } from "@playwright/test";

test("compute settings apply only after a real local SDK check and survive refresh", async ({
  page,
}) => {
  await page.goto("/#model");
  const editor = page.getByRole("textbox", {
    name: "Quantum model code editor",
  });
  const draft = "# Keep this compute test draft\nprint(42)\n";
  await editor.fill(draft);
  const select = page.getByRole("button", {
    name: "Choose compute environment",
  });
  const dialog = page.getByRole("dialog", { name: "Compute environment" });
  const check = dialog.getByRole("button", {
    name: "Check environment",
    exact: true,
  });
  const apply = dialog.getByRole("button", {
    name: "Use environment",
    exact: true,
  });
  const python = dialog.getByLabel("Python executable", { exact: true });
  const get = async (path) => {
    const response = await page.request.get(path);
    expect(response.ok()).toBeTruthy();
    return response.json();
  };
  const before = await get("/api/compute-environment");
  const runs = (await get("/api/python/runs")).map(({ id }) => id);
  await select.click();
  await expect(python).toHaveValue(before.config.local_python);
  await expect(apply).toBeDisabled();
  await python.fill("/missing/compute-environment-test/python");
  await check.click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Python executable is unavailable",
  );
  await expect(dialog.getByRole("alert")).toContainText(
    "no research code was executed",
  );
  await expect(apply).toBeDisabled();
  expect(await get("/api/compute-environment")).toEqual(before);
  await python.fill(before.config.local_python);
  await check.click();
  await expect(
    dialog.getByText("Environment ready", { exact: true }),
  ).toBeVisible();
  expect(await get("/api/compute-environment")).toEqual(before);
  await apply.click();
  await expect(dialog).toBeHidden();
  expect(await get("/api/compute-environment")).toEqual({
    ...before,
    revision: before.revision + 1,
  });
  await page.reload();
  await expect(editor).toHaveValue(draft);
  await select.click();
  await expect(python).toHaveValue(before.config.local_python);
  expect((await get("/api/python/runs")).map(({ id }) => id)).toEqual(runs);
});
