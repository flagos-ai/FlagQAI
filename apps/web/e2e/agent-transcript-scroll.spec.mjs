import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test, expect } from "@playwright/test";

test("latest output hides at the bottom and opening Worked for reveals its first tool", async ({
  page,
}) => {
  await page.goto("/#model");
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

  const editor = page.getByRole("textbox", {
    name: "Quantum model code editor",
  });
  const draft = "# Unpublished QAOA code";
  await editor.fill(draft);
  const composer = page.getByRole("textbox", {
    name: "Message FlagQAI",
    exact: true,
  });
  const transcript = page.getByRole("log", { name: "Agent conversation" });
  const latest = page.getByRole("button", {
    name: "Jump to latest output",
    exact: true,
  });
  const sent = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/messages"))
      sent.push(request.url());
  });
  await composer.fill(
    "transcript scroll acceptance\n\n" +
      Array.from(
        { length: 35 },
        (_, index) => `Research note ${index + 1}.`,
      ).join("\n\n"),
  );
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(transcript.getByText("Recorded finding 32.")).toBeVisible();

  await transcript.evaluate((node) => (node.scrollTop = 0));
  await expect(latest).toHaveText("↓");
  await transcript.evaluate((node) => (node.scrollTop = node.scrollHeight));
  await expect(latest).toHaveCount(0);
  await transcript.evaluate((node) => (node.scrollTop = 0));
  await expect(latest).toBeVisible();
  await latest.click();
  await expect(latest).toHaveCount(0);
  await expect
    .poll(() =>
      transcript.evaluate(
        (node) => node.scrollHeight - node.scrollTop - node.clientHeight,
      ),
    )
    .toBeLessThanOrEqual(2);

  await transcript.evaluate((node) => {
    const header = node.querySelector(".fq-agent-work > summary");
    const bounds = node.getBoundingClientRect();
    node.scrollTop += header.getBoundingClientRect().bottom - bounds.bottom + 6;
  });
  const worked = transcript.locator(".fq-agent-work > summary");
  const first = transcript
    .getByRole("region", { name: "Read tool call" })
    .first();
  await worked.click({ position: { x: 12, y: 8 } });
  await expect(first).toBeInViewport({ ratio: 0.8 });
  await expect(worked).toBeInViewport();
  await expect(first).toContainText("Failed · Earlier call");
  await expect(first.getByText("Fixture read failed.")).toHaveCount(0);
  await first.getByRole("button", { name: /Earlier call/ }).click();
  await expect(first.getByLabel("Tool result preview")).toContainText(
    "Fixture read failed.",
  );
  await expect(transcript.getByText("Recorded finding 32.")).toBeVisible();
  await first.getByRole("button", { name: /Earlier call/ }).click();
  await transcript.evaluate((node) => {
    const header = node.querySelector(".fq-agent-work > summary");
    node.scrollTop +=
      header.getBoundingClientRect().top -
      node.getBoundingClientRect().top -
      84;
  });
  const headingOffset = () =>
    worked.evaluate(
      (node) =>
        node.getBoundingClientRect().top -
        node.closest(".fq-agent-thread").getBoundingClientRect().top,
    );
  await expect.poll(headingOffset).toBeCloseTo(84, 0);
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(sessionStorage).some((key) =>
          key.startsWith("fq-agent-reading:"),
        ),
      ),
    )
    .toBe(true);

  const chatDraft = "Follow up on the saved results";
  await composer.fill(chatDraft);
  await page.reload();
  const connected = page.getByRole("status", {
    name: "Connected",
    exact: true,
  });
  await expect(connected).toBeVisible();
  await expect(transcript.locator("details.fq-agent-work[open]")).toHaveCount(
    1,
  );
  await expect.poll(headingOffset).toBeCloseTo(84, 0);

  const network = `http://127.0.0.1:${process.env.FQ_TEST_PROXY_PORT}/__fixture/network`;
  try {
    expect(
      (await page.request.post(network, { data: { offline: true } })).ok(),
    ).toBeTruthy();
    await expect(
      page.getByRole("status", { name: "Reconnecting…", exact: true }),
    ).toBeVisible();
  } finally {
    expect(
      (await page.request.post(network, { data: { offline: false } })).ok(),
    ).toBeTruthy();
  }
  await expect(connected).toBeVisible();
  await expect(transcript.locator("details.fq-agent-work[open]")).toHaveCount(
    1,
  );
  await expect.poll(headingOffset).toBeCloseTo(84, 0);
  await expect(editor).toHaveValue(draft);
  await expect(composer).toHaveValue(chatDraft);
  await expect(latest).toHaveAttribute("title", "Latest output");
  await latest.click();
  await expect(latest).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(sessionStorage).some((key) =>
          key.startsWith("fq-agent-reading:"),
        ),
      ),
    )
    .toBe(false);
  expect(sent).toHaveLength(1);

  await transcript.evaluate((node) => {
    node.scrollTop = 0;
  });
  await expect(latest).toHaveAttribute("title", "Latest output");
  const hold = join(process.env.FQ_E2E_CONTROL_DIR, "hold-unread-reply");
  await writeFile(
    hold,
    "Wait until the reader is away from the latest output.",
  );
  try {
    await composer.fill("unread reply acceptance");
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(
      page.getByRole("status", { name: "Working", exact: true }),
    ).toBeVisible();
    await expect(latest).toHaveAttribute("title", "Latest output");
  } finally {
    await rm(hold, { force: true });
  }
  await expect(latest).toHaveAttribute("data-unread", "true");
  await expect(latest).toHaveAttribute(
    "aria-description",
    "New reply available",
  );
  await expect
    .poll(() => transcript.evaluate((node) => node.scrollTop))
    .toBe(0);
  await page.reload();
  await expect(connected).toBeVisible();
  await expect(latest).toHaveAttribute("data-unread", "true");
  await expect
    .poll(() => transcript.evaluate((node) => node.scrollTop))
    .toBe(0);
  await latest.click();
  await expect(latest).toHaveCount(0);
  await expect(transcript.getByText("New scripted reply.")).toBeInViewport();
  await transcript.evaluate((node) => {
    node.scrollTop = 0;
  });
  await expect(latest).toHaveAttribute("title", "Latest output");
  await expect(latest).not.toHaveAttribute("data-unread");
  await page.reload();
  await expect(connected).toBeVisible();
  await expect(latest).toHaveAttribute("title", "Latest output");
  await expect(latest).not.toHaveAttribute("data-unread");
  await expect(editor).toHaveValue(draft);
  expect(sent).toHaveLength(2);
});
