import { expect, test } from "@playwright/test";

test("an interrupted Agent turn keeps its saved comparison available on demand", async ({
  page,
}) => {
  await page.goto("/#model");
  const editor = page.getByRole("textbox", {
    name: "Quantum model code editor",
  });
  const draft = "# Preserve unsaved research\nprint('keep')\n";
  const agent = page.getByRole("button", {
    name: "FlagQAI Agent",
    exact: true,
  });
  if ((await agent.getAttribute("aria-expanded")) !== "true")
    await agent.click();
  await page
    .getByRole("button", { name: "Connect Agent", exact: true })
    .click();
  await expect(
    page.getByRole("status", { name: "Connected", exact: true }),
  ).toBeVisible();
  const follow = page.getByRole("switch", { name: /Follow Agent/ });
  if ((await follow.getAttribute("aria-checked")) !== "true")
    await follow.click();
  await editor.fill(draft);
  await page
    .getByRole("textbox", { name: "Message FlagQAI", exact: true })
    .fill("interrupted comparison acceptance");
  await page.getByRole("button", { name: "Send message", exact: true }).click();

  const task = page.getByRole("region", {
    name: "Experiment progress",
    exact: true,
  });
  await expect(task).toContainText("Results saved · task interrupted");
  await expect(task).toContainText("1 run · 2 saved results");
  await expect(
    task.getByText("Open run details for execution or collection errors."),
  ).toHaveCount(0);
  const comparison = page.getByRole("region", {
    name: "Experiment comparison",
    exact: true,
  });
  await expect(comparison).toHaveCount(0);

  await page.reload();
  await expect(task).toContainText("Results saved · task interrupted");
  await task
    .getByRole("button", { name: "Compare results", exact: true })
    .click();
  await expect(comparison).toBeVisible();
  await page.getByRole("button", { name: "MODEL", exact: true }).click();
  await page
    .getByRole("button", { name: "Show model library", exact: true })
    .click();
  await page.getByRole("button", { name: /Draft · Python Bell pair/ }).click();
  await expect(editor).toHaveValue(draft);
});
