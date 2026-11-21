import { readFile } from "node:fs/promises";

const { entries } = JSON.parse(
  await readFile(
    new URL("../src/data/notebook-catalog.json", import.meta.url),
    "utf8",
  ),
);

export async function chooseNotebook(page, id) {
  const item = entries.find((item) => item.id === id || item.path === id);
  if (!item) throw new Error(`Unknown notebook: ${id}`);
  await page
    .getByRole("button", { name: "Notebook example", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Search notebooks" })
    .fill(item.path);
  await page
    .getByRole("listbox", { name: "Notebooks", exact: true })
    .locator(`[data-notebook-id="${item.id}"]`)
    .click();
}
