import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { qaoaSource } from "../src/tasks/qaoa-maxcut.mjs";

test("Agent research export retains real QAOA artifacts and stable retry identity", async ({
  page,
}) => {
  await page.goto("/#model");
  const editor = page.getByRole("textbox", {
    name: "Quantum model code editor",
  });
  const draft = "# Preserve the current unsaved research\n";
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
  const previousRunIds = (await (await page.request.get("/api/python/runs")).json()).map(item => item.id);
  const submitted = await page.request.post("/api/python/runs", {
    data: { source: qaoaSource, name: "QAOA export acceptance" },
  });
  expect(submitted.ok()).toBe(true);
  const initial = await submitted.json();
  let run;
  await expect
    .poll(
      async () => {
        run = await (
          await page.request.get(`/api/python/runs/${initial.id}`)
        ).json();
        return `${run.status}/${run.collection_status}`;
      },
      { timeout: 100000, intervals: [500] },
    )
    .toBe("completed/completed");
  expect(run.experiments).toHaveLength(3);
  const context = {
    client: "export-client",
    session: "export-session",
    page: "model",
    name: "Draft sentinel",
    source: draft,
    language: "python",
    dirty: true,
  };
  expect(
    (await page.request.post("/api/workspace/context", { data: context })).ok(),
  ).toBe(true);
  const request = {
    client: context.client,
    session: context.session,
    operation: "research.export",
    request_id: "qaoa-export-once",
    run_ids: [run.id],
    goal: "Compare QAOA baseline and optimized result with replay",
  };
  const prepared = await page.request.post("/api/workspace/actions", {
    data: request,
  });
  expect(prepared.ok()).toBe(true);
  const result = await prepared.json();
  const url = `/api/research/exports/${result.export.id}/file`;
  const response = await page.request.get(url);
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toBe("application/zip");
  const raw = await response.body();
  expect(createHash("sha256").update(raw).digest("hex")).toBe(
    result.export.sha256,
  );
  expect(raw.length).toBe(result.export.bytes);
  await page.reload();
  expect((await page.request.get(url)).ok()).toBe(true);
  expect(
    await (
      await page.request.post("/api/workspace/actions", { data: request })
    ).json(),
  ).toEqual(result);
  const imported = await page.request.post("/api/research/import", {
    data: raw,
    headers: {
      "Content-Type": "application/zip",
      "X-Filename": "qaoa-export.zip",
    },
  });
  expect(imported.ok()).toBe(true);
  const restored = await imported.json();
  expect(restored.research.goal).toBe(request.goal);
  expect(restored.runs[run.id].source).toBe(qaoaSource);
  expect(restored.runs[run.id].experiments.map((item) => item.sha256)).toEqual(
    run.experiments.map((item) => item.sha256),
  );
  expect(
    (await (await page.request.get("/api/python/runs")).json()).map(
      (item) => item.id,
    ),
  ).toEqual([run.id, ...previousRunIds]);
  await expect(editor).toHaveValue(draft);
  await expect(chat).toHaveValue("Keep this unsent question.");
});
