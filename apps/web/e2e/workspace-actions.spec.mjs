import { test, expect } from "@playwright/test";
import { openWorkspaceAction } from "./workspace-actions.mjs";

test("workspace actions disclose keyboard-accessible dialogs and preserve drafts", async ({
  page,
}, testInfo) => {
  await page.goto("/#model");
  const editor = page.getByRole("textbox", {
    name: "Quantum model code editor",
  });
  const draft = "# Keep the unsaved editor while opening workspace tools\n";
  await editor.fill(draft);
  const agent = page.getByRole("button", {
    name: "FlagQAI Agent",
    exact: true,
  });
  if ((await agent.getAttribute("aria-expanded")) !== "true")
    await agent.click();
  const chat = page.getByRole("textbox", {
    name: "Message FlagQAI",
    exact: true,
  });
  await chat.fill("Keep this unsent question.");
  const jobsBefore = await (await page.request.get("/api/jobs")).json();
  const runsBefore = await (await page.request.get("/api/python/runs")).json();
  const trigger = page.getByRole("button", {
    name: "Workspace actions",
    exact: true,
  });
  const menu = page.locator(".fq-header-tools .fq-toolbar-menu");
  await expect(
    page.locator(".fq-header-tools .fq-compute-trigger"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Research", exact: true }),
  ).toBeHidden();
  await trigger.focus();
  await trigger.press("Enter");
  await expect(menu).toHaveAttribute("open", "");
  await trigger.press("Escape");
  await expect(menu).not.toHaveAttribute("open", "");
  await expect(trigger).toBeFocused();
  await trigger.press("Space");
  await trigger.press("Tab");
  const research = menu.getByRole("button", { name: "Research", exact: true });
  await expect(research).toBeFocused();
  await research.press("Enter");
  const library = page.getByRole("dialog", {
    name: "Research packages",
    exact: true,
  });
  await expect(library).toBeVisible();
  await library.press("Escape");
  await expect(library).toHaveCount(0);
  await expect(menu).toHaveAttribute("open", "");
  await expect(research).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await openWorkspaceAction(page, "Backups");
  const backups = page.getByRole("dialog", {
    name: "Workspace backups",
    exact: true,
  });
  await expect(backups).toBeVisible();
  await backups.press("Escape");
  await expect(backups).toHaveCount(0);
  await expect(menu).toHaveAttribute("open", "");
  await openWorkspaceAction(page, "User Guide ↗");
  const guide = page.getByRole("dialog", {
    name: "FlagQuantum guide",
    exact: true,
  });
  await expect(guide).toBeVisible();
  await guide.press("Escape");
  await expect(guide).toHaveCount(0);
  await expect(menu).toHaveAttribute("open", "");
  await expect(
    menu.getByRole("button", { name: "User Guide ↗", exact: true }),
  ).toBeFocused();
  await editor.click();
  await expect(menu).not.toHaveAttribute("open", "");
  await expect(editor).toHaveValue(draft);
  await expect(chat).toHaveValue("Keep this unsent question.");
  for (const width of [1440, 1024, 800]) {
    await page.setViewportSize({ width, height: 900 });
    await trigger.click();
    const bounds = await menu.locator(".fq-toolbar-menu-items").boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: testInfo.outputPath(`workspace-actions-${width}.png`),
      fullPage: true,
    });
    await trigger.press("Escape");
  }
  await page.reload();
  await expect(editor).toHaveValue(draft);
  await expect(chat).toHaveValue("Keep this unsent question.");
  expect(
    (await (await page.request.get("/api/jobs")).json()).map((item) => item.id),
  ).toEqual(jobsBefore.map((item) => item.id));
  expect(
    (await (await page.request.get("/api/python/runs")).json()).map(
      (item) => item.id,
    ),
  ).toEqual(runsBefore.map((item) => item.id));
});
