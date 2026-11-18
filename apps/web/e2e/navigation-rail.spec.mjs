import { test, expect } from "@playwright/test";

test("navigation stays reachable in short viewports and preserves drafts", async ({
  page,
}, testInfo) => {
  await page.goto("/#model");
  const editor = page.getByRole("textbox", {
    name: "Quantum model code editor",
  });
  const draft = "# Navigation must preserve unsaved research\n";
  await editor.fill(draft);
  const rail = page.getByRole("navigation", { name: "Research workspace" });
  const agent = rail.getByRole("button", {
    name: "FlagQAI Agent",
    exact: true,
  });
  if ((await agent.getAttribute("aria-expanded")) !== "true")
    await agent.click();
  const chat = page.getByRole("textbox", {
    name: "Message FlagQAI",
    exact: true,
  });
  await chat.fill("Keep this unsent research question.");
  for (const [width, height] of [
    [1440, 900],
    [1024, 600],
    [800, 400],
  ]) {
    await page.setViewportSize({ width, height });
    for (const [label, hash] of [
      ["SYNTHESIS", "synthesis"],
      ["QUANTUM", "program"],
      ["EXECUTION", "execution"],
      ["JOBS", "jobs"],
      ["MODEL", "model"],
    ]) {
      const button = rail.getByRole("button", { name: label, exact: true });
      await button.focus();
      await button.press("Enter");
      await expect(page).toHaveURL(new RegExp(`#${hash}$`));
      await expect(button).toHaveAttribute("aria-current", "page");
      await expect(rail.locator('[aria-current="page"]')).toHaveCount(1);
    }
    const guide = rail.getByRole("button", { name: "LEARN MORE", exact: true });
    await guide.focus();
    await expect(guide).toBeInViewport();
    await guide.press("Enter");
    const dialog = page.getByRole("dialog", {
      name: "FlagQuantum guide",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    await dialog.press("Escape");
    await rail.getByRole("button", { name: "MODEL", exact: true }).click();
    await page.screenshot({
      path: testInfo.outputPath(`navigation-${width}-${height}.png`),
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  if ((await agent.getAttribute("aria-expanded")) !== "true")
    await agent.click();
  await expect(editor).toHaveValue(draft);
  await expect(chat).toHaveValue("Keep this unsent research question.");
  await page.reload();
  await expect(editor).toHaveValue(draft);
  await expect(chat).toHaveValue("Keep this unsent research question.");
});
