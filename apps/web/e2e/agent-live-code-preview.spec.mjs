import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

test("Follow Agent previews streamed Python without touching the draft or starting a run", async ({
  page,
}) => {
  await page.goto("/#model");
  const editor = page.getByRole("textbox", {
    name: "Quantum model code editor",
  });
  const draft = "# Keep my draft\nprint('draft')\n";
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

  const preview = page.getByRole("region", { name: "Live Python preview" });
  const code = preview.locator("pre");
  const composer = page.getByRole("textbox", {
    name: "Message FlagQAI",
    exact: true,
  });
  const hold = join(process.env.FQ_E2E_CONTROL_DIR, "hold-live-python");
  const holdModel = join(
    process.env.FQ_E2E_CONTROL_DIR,
    "hold-live-python-model",
  );
  const runIds = async () => {
    const response = await page.request.get("/api/python/runs");
    expect(response.ok()).toBeTruthy();
    return (await response.json()).map(({ id }) => id).sort();
  };
  const before = await runIds();
  const submit = async () => {
    await composer.fill("live code acceptance");
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
  };
  try {
    await writeFile(hold, "observe partial source");
    await writeFile(holdModel, "observe complete source");
    await page.getByRole("button", { name: "EXECUTION", exact: true }).click();
    await submit();
    await expect(page).toHaveURL(/#model$/);
    await expect(preview).toContainText("Agent writing Python · Read-only");
    await expect(code).toHaveText("# Quantum preview · ψ\nprint");
    await expect(editor).toHaveCount(0);

    await follow.click();
    await expect(preview).toHaveCount(0);
    await expect(editor).toHaveValue(draft);
    await follow.click();
    await expect(code).toHaveText("# Quantum preview · ψ\nprint");

    await rm(hold);
    const source = '# Quantum preview · ψ\nprint("ready")\n';
    await expect(code).toHaveText(source);
    expect(await runIds()).toEqual(before);
    await rm(holdModel);
    await expect(preview).toHaveCount(0);
    await expect(editor).toHaveValue(source);
    await page
      .getByRole("button", { name: "Return to draft", exact: true })
      .click();
    await expect(editor).toHaveValue(draft);

    await writeFile(hold, "stop before creating a model");
    await submit();
    await expect(code).toHaveText("# Quantum preview · ψ\nprint");
    const network = `http://127.0.0.1:${process.env.FQ_TEST_PROXY_PORT}/__fixture/network`;
    try {
      const offline = await page.request.post(network, {
        data: { offline: true },
      });
      expect(offline.ok()).toBeTruthy();
      await expect(
        page.getByRole("status", { name: "Reconnecting…", exact: true }),
      ).toBeVisible();
      await expect(preview).toHaveCount(0);
    } finally {
      const online = await page.request.post(network, {
        data: { offline: false },
      });
      expect(online.ok()).toBeTruthy();
    }
    await expect(
      page.getByRole("status", { name: "Working", exact: true }),
    ).toBeVisible();
    await expect(preview).toHaveCount(0);
    await page.getByRole("button", { name: "Stop Agent", exact: true }).click();
    await expect(preview).toHaveCount(0);
    await expect(editor).toHaveValue(draft);
    await page.reload();
    await expect(preview).toHaveCount(0);
    await expect(editor).toHaveValue(draft);
    expect(await runIds()).toEqual(before);
  } finally {
    await rm(hold, { force: true });
    await rm(holdModel, { force: true });
  }
});
