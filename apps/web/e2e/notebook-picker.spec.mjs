import { test, expect } from "@playwright/test";

test("Notebook picker searches compact results and supports keyboard dismissal and selection", async ({
  page,
}) => {
  await page.goto("/#model");
  await page
    .getByRole("group", { name: "Source language" })
    .getByRole("button", { name: "Notebook", exact: true })
    .click();
  const trigger = page.getByRole("button", {
    name: "Notebook example",
    exact: true,
  });
  const initial = await trigger.getAttribute("data-notebook-id");
  await trigger.click();
  const dialog = page.getByRole("dialog", {
    name: "Choose notebook",
    exact: true,
  });
  const search = dialog.getByRole("combobox", { name: "Search notebooks" });
  await expect(search).toBeFocused();
  await expect(dialog.getByRole("option", { selected: true })).toHaveAttribute(
    "data-notebook-id",
    initial,
  );
  await search.fill("no-notebook-can-match-this");
  await expect(dialog).toContainText("No matching notebooks.");
  await search.press("Enter");
  await expect(trigger).toHaveAttribute("data-notebook-id", initial);
  await search.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(dialog).toHaveCount(0);
  await trigger.press("ArrowDown");
  await search.fill("cooling");
  await expect(dialog.getByRole("option")).toHaveCount(1);
  for (const width of [1440, 1000]) {
    await page.setViewportSize({ width, height: 800 });
    const box = await dialog.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y + box.height).toBeLessThanOrEqual(800);
    expect(box.height).toBeLessThanOrEqual(461);
    await page.screenshot({
      path: `test-results/notebook-picker-search-${width}.png`,
    });
  }
  await search.press("ArrowDown");
  await search.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(trigger).toContainText("Cooling-system optimization");
  await trigger.click();
  await expect(dialog.getByRole("option", { selected: true })).toContainText(
    "Cooling-system optimization",
  );
  await page.screenshot({
    path: "test-results/notebook-picker-categories.png",
  });
  await page
    .getByRole("button", { name: "Focus model editor", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toContainText("Cooling-system optimization");
});
