export async function openWorkspaceAction(page, name) {
  const menu = page.locator(".fq-header-tools .fq-toolbar-menu");
  if (!(await menu.evaluate((element) => element.open)))
    await page
      .getByRole("button", { name: "Workspace actions", exact: true })
      .click();
  await menu.getByRole("button", { name, exact: true }).click();
}
