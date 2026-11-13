import { test, expect } from "@playwright/test";

const network = `http://127.0.0.1:${process.env.FQ_TEST_PROXY_PORT}/__fixture/network`;
const editor = (page) =>
  page.getByRole("textbox", { name: "Quantum model code editor" });
const composer = (page) =>
  page.getByRole("textbox", { name: "Message FlagQAI", exact: true });
const pending = (page) =>
  page.getByRole("article", { name: "Pending message", exact: true });
const editorDraft =
  "# Preserve this unsaved QAOA draft\nprint('local draft')\n";
const chatDraft = "A newer unsent QAOA follow-up";
const sent = (page) => {
  const requests = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/messages"))
      requests.push(request.postDataJSON());
  });
  return requests;
};
async function configure(page, data) {
  expect((await page.request.post(network, { data })).ok()).toBeTruthy();
}
async function stats(page) {
  return (await page.request.get(network)).json();
}
async function connected(page) {
  await expect(
    page.getByRole("status", { name: "Connected", exact: true }),
  ).toBeVisible();
}
async function send(page, text) {
  await composer(page).fill(text);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
}
test.beforeEach(async ({ page }) => {
  await configure(page, { offline: false });
  await page.goto("/#model");
  await expect(editor(page)).toBeVisible();
  const agent = page.getByRole("button", {
    name: "FlagQAI Agent",
    exact: true,
  });
  if ((await agent.getAttribute("aria-expanded")) !== "true")
    await agent.click();
  await page
    .getByRole("button", { name: "Connect Agent", exact: true })
    .click();
  await connected(page);
  await editor(page).fill(editorDraft);
});
test.afterEach(async () => {
  // Independent of the browser's deadline: no later test inherits an outage.
  await fetch(network, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
});

test("inline delivery recovery: dropped request, refresh, native rebind and lost retry receipt dispatch once", async ({
  page,
}, testInfo) => {
  const requests = sent(page);
  const before = (await stats(page)).submissionCount;
  const question = "delivery acceptance: QAOA original";
  await configure(page, { disconnectNextMessage: true });
  await send(page, question);
  await expect(pending(page)).toContainText(question);
  await expect(pending(page)).toContainText("Delivery unconfirmed");
  await expect(pending(page).getByRole("button")).toHaveCount(0);
  await composer(page).fill(chatDraft);
  await page.reload();
  await expect(pending(page)).toContainText("Delivery unconfirmed");
  await expect(composer(page)).toHaveValue(chatDraft);
  await expect(editor(page)).toHaveValue(editorDraft);
  await configure(page, { offline: true, restartAgent: true });
  await configure(page, { offline: false });
  await connected(page);
  await expect(pending(page)).toContainText("Not delivered");
  expect((await stats(page)).submissionCount).toBe(before);
  await expect(
    pending(page).getByRole("button", { name: "Retry original message" }),
  ).toBeEnabled();
  await page.screenshot({
    path: testInfo.outputPath("inline-not-delivered.png"),
    fullPage: true,
  });
  await configure(page, { dropNextReceipt: true });
  await pending(page)
    .getByRole("button", { name: "Retry original message" })
    .click();
  await expect(pending(page)).toContainText("Delivery unconfirmed");
  await expect
    .poll(async () => (await stats(page)).submissionCount)
    .toBe(before + 1);
  await configure(page, { offline: true, restartAgent: true });
  await page.reload();
  await expect(pending(page)).toContainText("Delivery unconfirmed");
  await configure(page, { offline: false });
  await connected(page);
  await expect(pending(page)).toHaveCount(0);
  await expect(page.locator(".fq-agent-message.assistant")).toContainText(
    "QAOA delivery fixture acknowledged",
  );
  await expect(page.locator(".fq-agent-message.user")).toHaveCount(1);
  expect((await stats(page)).submissionCount).toBe(before + 1);
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
  await expect(composer(page)).toHaveValue(chatDraft);
  await expect(editor(page)).toHaveValue(editorDraft);
});

test("inline delivery recovery: accepted receipt without transcript echo is reconciled after service restart", async ({
  page,
}) => {
  const requests = sent(page);
  const before = (await stats(page)).submissionCount;
  await configure(page, { dropNextReceipt: true });
  await send(page, "delivery acceptance: receipt-only");
  await expect(pending(page)).toContainText("Delivery unconfirmed");
  await expect
    .poll(async () => (await stats(page)).submissionCount)
    .toBe(before + 1);
  await composer(page).fill(chatDraft);
  await configure(page, { offline: true, restartAgent: true });
  await page.reload();
  const accepted = page.waitForResponse(
    async (response) =>
      response.request().method() === "GET" &&
      /\/messages\/[^/]+$/.test(new URL(response.url()).pathname) &&
      response.ok() &&
      (await response.json()).status === "accepted",
  );
  await configure(page, { offline: false });
  expect((await accepted).headers()["cache-control"]).toBe("no-store");
  await expect(pending(page)).toHaveCount(0);
  expect((await stats(page)).submissionCount).toBe(before + 1);
  expect(requests).toHaveLength(1);
  await expect(composer(page)).toHaveValue(chatDraft);
  await expect(editor(page)).toHaveValue(editorDraft);
});

test("inline delivery recovery: lookup errors and unknown outcomes never offer retry or automatic submission", async ({
  page,
}, testInfo) => {
  const before = (await stats(page)).submissionCount;
  const requests = sent(page);
  let lookups = 0;
  let unknown = false;
  await page.route("**/v1/sessions/*/messages/*", async (route) => {
    lookups++;
    await route.fulfill({
      status: unknown ? 200 : 500,
      contentType: "application/json",
      body: JSON.stringify(
        unknown
          ? { status: "unconfirmed" }
          : {
              error: {
                code: "fixture_lookup_offline",
                message: "Status lookup unavailable",
              },
            },
      ),
    });
  });
  await page.route(
    "**/v1/sessions/*/messages",
    (route) => route.abort("failed"),
    { times: 1 },
  );
  await send(page, "delivery acceptance: QAOA unknown");
  await expect(pending(page)).toContainText("Delivery unconfirmed");
  await expect.poll(() => lookups).toBeGreaterThanOrEqual(1);
  unknown = true;
  await expect.poll(() => lookups).toBeGreaterThanOrEqual(2);
  await expect(pending(page).getByRole("button")).toHaveCount(0);
  await page.getByRole("button", { name: "New chat", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Resolve the pending message",
  );
  await page.getByRole("button", { name: "Dismiss Agent error" }).click();
  await expect(pending(page)).toContainText("Delivery unconfirmed");
  expect((await stats(page)).submissionCount).toBe(before);
  expect(requests).toHaveLength(1);
  await composer(page).fill(chatDraft);
  await page.screenshot({
    path: testInfo.outputPath("inline-unconfirmed.png"),
    fullPage: true,
  });
  await page.unroute("**/v1/sessions/*/messages/*");
  await expect(pending(page)).toContainText("Not delivered");
  await expect(composer(page)).toHaveValue(chatDraft);
  await expect(editor(page)).toHaveValue(editorDraft);
  await pending(page)
    .getByRole("button", { name: "Retry original message" })
    .click();
  await expect(pending(page)).toHaveCount(0);
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
  expect((await stats(page)).submissionCount).toBe(before + 1);
});

test("inline delivery recovery: explicit refusal can be retried deliberately and dismissed without losing drafts", async ({
  page,
}) => {
  const before = (await stats(page)).submissionCount;
  const requests = sent(page);
  await send(page, "reject QAOA candidate");
  await expect(pending(page)).toContainText("Not delivered");
  await expect(pending(page)).toContainText("Scripted rejection");
  await composer(page).fill(chatDraft);
  await page.reload();
  await expect(pending(page)).toContainText("Not delivered");
  expect((await stats(page)).submissionCount).toBe(before + 1);
  await pending(page)
    .getByRole("button", { name: "Retry original message" })
    .click();
  await expect
    .poll(async () => (await stats(page)).submissionCount)
    .toBe(before + 2);
  await expect(pending(page)).toContainText("Not delivered");
  expect(requests).toHaveLength(2);
  expect(requests[1].clientMessageId).not.toBe(requests[0].clientMessageId);
  expect(requests[1].text).toBe(requests[0].text);
  await pending(page)
    .getByRole("button", { name: "Dismiss", exact: true })
    .click();
  await expect(pending(page)).toHaveCount(0);
  await expect(composer(page)).toHaveValue(chatDraft);
  await expect(editor(page)).toHaveValue(editorDraft);
  expect((await stats(page)).submissionCount).toBe(before + 2);
});

test("inline delivery recovery: later admission supersedes an earlier absence lookup without another browser send", async ({
  page,
}) => {
  const requests = sent(page);
  const before = (await stats(page)).submissionCount;
  await page.route(
    "**/v1/sessions/*/messages",
    (route) => route.abort("failed"),
    { times: 1 },
  );
  await send(page, "delivery acceptance: receipt-only");
  await expect(pending(page)).toContainText("Not delivered");
  await composer(page).fill(chatDraft);
  const saved = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("fq-agent-pending-delivery-v1")),
  );
  // Deliver the exact original request later, after an earlier absence query.
  // This models a delayed in-flight request, not another action by the user.
  const response = await page.request.post(
    `/v1/sessions/${saved.session}/messages`,
    { data: requests[0] },
  );
  expect(response.status()).toBe(202);
  expect((await response.json()).receipt.accepted).toBe(true);
  await expect(pending(page)).toHaveCount(0);
  expect(requests).toHaveLength(1);
  expect((await stats(page)).submissionCount).toBe(before + 1);
  await expect(composer(page)).toHaveValue(chatDraft);
  await expect(editor(page)).toHaveValue(editorDraft);
});
