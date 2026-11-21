import { test, expect } from "@playwright/test";

test("question choices retain compact native controls and whole-row selection", async ({
  page,
}) => {
  await page.goto("/#model");
  const toggle = page.getByRole("button", {
    name: "FlagQAI Agent",
    exact: true,
  });
  if ((await toggle.getAttribute("aria-expanded")) !== "true")
    await toggle.click();
  await page
    .getByRole("button", { name: "Connect Agent", exact: true })
    .click();
  await expect(
    page.getByRole("status", { name: "Connected", exact: true }),
  ).toBeVisible();
  const editor = page.getByRole("textbox", {
    name: "Quantum model code editor",
  });
  await editor.fill("# Preserve this research draft");
  const composer = page.getByRole("textbox", {
    name: "Message FlagQAI",
    exact: true,
  });
  const ask = async () => {
    await composer.fill("control acceptance: question-layout");
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(page.locator(".fq-agent-question")).toBeVisible();
  };
  await ask();
  const card = page.locator(".fq-agent-question");
  const submit = card.getByRole("button", {
    name: "Submit answers",
    exact: true,
  });
  await expect(submit).toBeDisabled();
  for (const width of [1440, 1000]) {
    await page.setViewportSize({ width, height: 1000 });
    const geometry = await card.evaluate((node) => {
      const radio = node.querySelector('input[type="radio"]');
      const text = radio.nextElementSibling;
      return {
        radioWidth: radio.getBoundingClientRect().width,
        gap:
          text.getBoundingClientRect().left -
          radio.getBoundingClientRect().right,
        overflow: node.scrollWidth - node.clientWidth,
      };
    });
    expect(geometry.radioWidth).toBeLessThanOrEqual(18);
    expect(geometry.gap).toBeGreaterThanOrEqual(6);
    expect(geometry.gap).toBeLessThanOrEqual(12);
    expect(geometry.overflow).toBeLessThanOrEqual(1);
  }
  const bell = card.getByRole("radio", { name: /贝尔态制备/ });
  await card.getByText(/H \+ CNOT 制备/).click();
  await expect(bell).toBeChecked();
  await expect(submit).toBeEnabled();
  await bell.focus();
  await bell.press("ArrowDown");
  await expect(card.getByRole("radio", { name: /贝尔不等式/ })).toBeChecked();
  await card
    .getByRole("textbox", { name: "Custom answer 1" })
    .fill("保留现有基线，先验证测量结果");
  await composer.fill("Keep this unsent chat draft");
  await card.screenshot({ path: "test-results/agent-question-layout.png" });
  await submit.click();
  await expect(card).toHaveCount(0);
  await expect(composer).toHaveValue("Keep this unsent chat draft");
  await expect(editor).toHaveValue("# Preserve this research draft");
  await ask();
  await card.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(card).toHaveCount(0);
  await expect(editor).toHaveValue("# Preserve this research draft");
});
