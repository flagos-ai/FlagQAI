import { test, expect } from "@playwright/test";
import { writeFile, rm } from "node:fs/promises";
import { join } from "node:path";

const editor = (page) =>
  page.getByRole("textbox", { name: "Quantum model code editor" });
const draft = "# Newer unsaved draft — preserve this\nprint('my work')\n";
const bell = `import flagquantum as fq
circuit = fq.Circuit(2).h(0).cx(0, 1)
result = fq.run(circuit, outputs=fq.counts(), options=fq.ExecutionOptions(shots=128, seed=42))
fq.save("bell.fqx", result.plan, result=result)
print(result.counts)
`;
async function showJobEvidence(page) {
  const result = page.getByRole("region", { name: "Job results", exact: true });
  await result.getByRole("button", { name: "Table", exact: true }).click();
  const disclosure = result.locator("details.fq-job-provenance");
  if ((await disclosure.getAttribute("open")) === null)
    await result
      .getByLabel("Run details and provenance", { exact: true })
      .click();
  return result;
}
async function get(page, path) {
  const response = await page.request.get(path);
  expect(response.ok()).toBeTruthy();
  return response.json();
}
async function runPython(page, source) {
  const before = new Set(
    (await get(page, "/api/python/runs")).map((run) => run.id),
  );
  if (source !== undefined) await editor(page).fill(source);
  await page
    .getByRole("button", { name: /^(Run Python|Save & run)$/, exact: true })
    .click();
  let run;
  await expect
    .poll(
      async () => {
        const newest = (await get(page, "/api/python/runs")).find(
          (item) => !before.has(item.id),
        );
        if (!newest) return "not submitted";
        run = await get(page, "/api/python/runs/" + newest.id);
        return run.status;
      },
      { timeout: 90000 },
    )
    .not.toMatch(/^(not submitted|queued|running)$/);
  await expect(page.getByLabel("Python run history")).toHaveValue(run.id);
  return run;
}
async function savedRecord(page, run, filename) {
  const reference = run.experiments.find(
    (item) => !filename || item.filename === filename,
  );
  expect(reference).toBeTruthy();
  const record = await get(page, "/api/experiments/" + reference.id);
  expect(record.program.origin.run_id).toBe(run.id);
  expect(record.program.origin.source).toBe(run.source);
  expect(record.program.origin.source_hash).toBe(run.source_hash);
  expect(record.program.experiment.sha256).toBe(reference.sha256);
  return record;
}
async function openCircuit(page, run, filename) {
  const reference = run.experiments.find(
    (item) => !filename || item.filename === filename,
  );
  await page
    .getByRole("group", { name: reference.filename, exact: true })
    .getByRole("button", { name: "View circuit ↗" })
    .click();
  await expect(page).toHaveURL(/#program$/);
  await expect(
    page.getByRole("link", { name: "Download original .fqx ↓" }),
  ).toHaveAttribute("href", `/api/experiments/${reference.id}/file`);
  await expect(
    page.getByText("· run " + run.id.slice(0, 8), { exact: false }),
  ).toBeVisible();
  return reference;
}

test.beforeEach(async ({ page }) => {
  await page.goto("/#model");
  await expect(editor(page)).toBeVisible();
});

for (const [name, states] of [
  ["Bell State", ["00", "11"]],
  ["GHZ State", ["000", "111"]],
  ["X State", ["1"]],
  ["Quantum Arithmetic · 3x + 2", null],
]) {
  test(`real SDK example: ${name} → .fqx → circuit → results`, async ({
    page,
  }) => {
    const agent = page.getByRole("button", {
      name: "FlagQAI Agent",
      exact: true,
    });
    if ((await agent.getAttribute("aria-expanded")) === "true")
      await agent.click();
    await page
      .getByRole("button", {
        name: new RegExp("^" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      })
      .click();
    const run = await runPython(page);
    expect(run.status, JSON.stringify(run)).toBe("completed");
    expect(run.collection_status).toBe("completed");
    expect(run.runtime.sdk_version).toBe("0.4.0");
    const record = await savedRecord(page, run);
    const counts = record.job.result.counts;
    if (states) expect(Object.keys(counts).sort()).toEqual(states.sort());
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    await openCircuit(page, run);
    await expect(
      page.getByRole("group", {
        name: "Interactive hierarchical quantum circuit",
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "View saved result →" }).click();
    await expect(page).toHaveURL(/#jobs$/);
    const results = page.getByRole("region", {
      name: "Job results",
      exact: true,
    });
    await expect(
      results.getByRole("region", { name: "Measurement distribution" }),
    ).toBeVisible();
    await results.getByRole("button", { name: "Table", exact: true }).click();
    for (const count of Object.values(counts))
      await expect(results.getByRole("table")).toContainText(
        count.toLocaleString("en-US"),
      );
    await results
      .getByLabel("Run details and provenance", { exact: true })
      .click();
    await expect(
      results.getByRole("link", { name: "Download original .fqx ↓" }),
    ).toHaveAttribute("href", `/api/experiments/${record.id}/file`);
  });
}

test("refresh and navigation retain a selected historical result and newer draft", async ({
  page,
}) => {
  const first = await runPython(page, bell);
  const second = await runPython(
    page,
    bell.replace("result = fq.run", "circuit.x(1)\nresult = fq.run"),
  );
  expect(
    Object.keys((await savedRecord(page, second)).job.result.counts).sort(),
  ).toEqual(["01", "10"]);
  await page.getByLabel("Python run history").selectOption(first.id);
  await editor(page).fill(draft);
  const reference = await openCircuit(page, first);
  await expect(
    page.getByText("Differs from editor", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/#program$/);
  await expect(
    page.getByRole("link", { name: "Download original .fqx ↓" }),
  ).toHaveAttribute("href", `/api/experiments/${reference.id}/file`);
  await page.getByRole("button", { name: "MODEL", exact: true }).click();
  await expect(editor(page)).toHaveValue(draft);
  await expect(page.getByLabel("Python run history")).toHaveValue(first.id);
});

test("missing output and real Python errors are distinct and preserve run history", async ({
  page,
}) => {
  const empty = await runPython(page, "print('no archive saved')");
  expect(empty.status).toBe("completed");
  expect(empty.experiments).toHaveLength(0);
  await expect(
    page.getByText(/No .fqx files were saved by this run/),
  ).toBeVisible();
  for (const [source, error] of [
    ["def broken(:\n pass", "SyntaxError"],
    ["import flagqai_nonexistent_acceptance_dependency", "ModuleNotFoundError"],
    ["import flagquantum as fq\nfq.Circuit(1).h(99)", "ValidationError"],
  ]) {
    const run = await runPython(page, source);
    expect(run.status).toBe("failed");
    expect(run.logs.map((item) => item.text).join("")).toContain(error);
    await expect(
      page.getByRole("button", { name: "Ask Agent to fix", exact: true }),
    ).toBeVisible();
  }
  await page.getByLabel("Python run history").selectOption(empty.id);
  await expect(
    page.getByText("no archive saved", { exact: false }).last(),
  ).toBeVisible();
});

test("preview outage recovers same-name files without rerun; corrupt file stays separate", async ({
  page,
}) => {
  const fault = join(process.env.FQ_E2E_CONTROL_DIR, "preview-offline");
  let run;
  try {
    await writeFile(fault, "test only");
    run = await runPython(
      page,
      bell +
        `from pathlib import Path
Path("nested").mkdir()
fq.save("nested/bell.fqx", result.plan, result=result)
Path("invalid.fqx").write_bytes(b"invalid archive")
`,
    );
    expect(run.status).toBe("completed");
    expect(run.collection_status).toBe("failed");
    expect(run.collection_errors).toHaveLength(3);
  } finally {
    await rm(fault, { force: true });
  }
  await editor(page).fill(draft);
  await page
    .getByRole("button", { name: "Retry collection", exact: true })
    .click();
  await expect(
    page
      .getByRole("group", { name: "nested/bell.fqx", exact: true })
      .getByText(/Loaded in Quantum/),
  ).toBeVisible();
  const recovered = await get(page, "/api/python/runs/" + run.id);
  expect(recovered.collection_status).toBe("partial");
  expect(recovered.experiments).toHaveLength(2);
  expect(new Set(recovered.experiments.map((item) => item.id)).size).toBe(2);
  for (const key of [
    "id",
    "source",
    "source_hash",
    "status",
    "exit_code",
    "logs",
    "finished_at",
  ])
    expect(recovered[key]).toEqual(run[key]);
  expect(recovered.collection_errors.map((item) => item.filename)).toEqual([
    "invalid.fqx",
  ]);
  await page
    .getByRole("button", { name: "Retry collection", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry collection", exact: true }),
  ).toBeEnabled();
  expect((await get(page, "/api/python/runs/" + run.id)).experiments).toEqual(
    recovered.experiments,
  );
  await expect(editor(page)).toHaveValue(draft);
  await openCircuit(page, recovered, "nested/bell.fqx");
});

test("scripted Agent streams tools, survives lost receipt + refresh, and protects code and chat drafts", async ({
  page,
}) => {
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
  const failed = await runPython(
    page,
    "# repair-case: syntax\nimport flagquantum as fq\nfq.Circuit(",
  );
  expect(failed.status).toBe("failed");
  await page
    .getByRole("button", { name: "Ask Agent to fix", exact: true })
    .click();
  const input = page.getByRole("textbox", {
    name: "Message FlagQAI",
    exact: true,
  });
  await expect(input).toHaveValue(new RegExp(failed.id.slice(0, 8)));
  await editor(page).fill(draft);
  await expect(
    page.getByRole("button", { name: "Send message", exact: true }),
  ).toBeEnabled();
  const controlURL = `http://127.0.0.1:${process.env.FQ_TEST_PROXY_PORT}/__fixture/network`;
  const hold = join(process.env.FQ_E2E_CONTROL_DIR, "hold-repair");
  await writeFile(hold, "Wait for live tool observation after reconnect");
  const before = (await get(page, controlURL)).submissionCount;
  expect(
    (
      await page.request.post(controlURL, { data: { dropNextReceipt: true } })
    ).ok(),
  ).toBeTruthy();
  try {
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect
      .poll(async () => (await get(page, controlURL)).submissionCount)
      .toBe(before + 1);
    await input.fill("Keep this newer unsent chat draft.");
    await page.reload();
    await expect(input).toHaveValue("Keep this newer unsent chat draft.");
  } catch (problem) {
    await rm(hold, { force: true });
    throw problem;
  } finally {
    // Cleanup is independent of Playwright's test deadline so it cannot mask
    // the original UI error or leave later tests behind an offline proxy.
    const restored = await fetch(controlURL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offline: false }),
      signal: AbortSignal.timeout(5000),
    });
    expect(restored.ok).toBeTruthy();
  }
  try {
    await expect(
      page.locator(".fq-agent-work-live .fq-cli-tool").first(),
    ).toBeVisible();
    await expect(page.locator(".fq-agent-work-live")).toContainText(
      "python.read",
    );
  } finally {
    await rm(hold, { force: true });
  }
  await expect(page.locator(".fq-agent-message.assistant")).toContainText(
    "Scripted Agent acceptance; actual FlagQuantum computation.",
    { timeout: 90000 },
  );
  const workSummary = page.locator(".fq-agent-work > summary");
  await expect(workSummary).toBeVisible();
  await expect(workSummary).toContainText("Worked");
  await workSummary.click();
  await expect(page.locator(".fq-cli-tool").first()).toBeVisible();
  expect((await get(page, controlURL)).submissionCount).toBe(before + 1);
  await page.getByRole("button", { name: "MODEL", exact: true }).click();
  await expect(editor(page)).toHaveValue(draft);
  await expect(input).toHaveValue("Keep this newer unsent chat draft.");
  await page
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Keep my draft", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Keep my draft", exact: true })
    .click();
  await expect(editor(page)).toHaveValue(draft);
  const old = await get(page, "/api/python/runs/" + failed.id);
  expect(old.source).toBe(failed.source);
  expect(old.status).toBe("failed");
});

test("project files, native Agent edits, draft review and multi-file SDK snapshots survive refresh", async ({
  page,
}) => {
  const main =
    "# project-acceptance\n" +
    bell.replace(
      "circuit = fq.Circuit(2).h(0).cx(0, 1)",
      "from helper import prepare\ncircuit = prepare(fq)",
    );
  const helper = "def prepare(fq):\n    return fq.Circuit(2).h(0).cx(0, 1)\n";
  await page
    .getByRole("button", { name: "Open project workspace", exact: true })
    .click();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page.getByRole("button", { name: "Create new", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Project directory", exact: true })
    .fill("browser-project");
  await page
    .getByRole("button", { name: "Create folder", exact: true })
    .click();
  const create = async (path, source) => {
    await page.getByRole("button", { name: "New file", exact: true }).click();
    await page
      .getByRole("textbox", { name: "New project file", exact: true })
      .fill(path);
    await page
      .getByRole("button", { name: "Create project file", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Switch to " + path, exact: true }),
    ).toBeVisible();
    await editor(page).fill(source);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      page.getByRole("status").filter({ hasText: /^Saved$/ }),
    ).toBeVisible();
  };
  await create("helper.py", helper);
  await create("main.py", main);
  const first = await runPython(page);
  expect(first.status).toBe("completed");
  expect(first.project.files.map((item) => item.path).sort()).toEqual([
    "helper.py",
    "main.py",
  ]);
  const original = await savedRecord(page, first);
  expect(original.program.origin.project.snapshot_hash).toBe(
    first.project.snapshot_hash,
  );
  expect(Object.keys(original.job.result.counts).sort()).toEqual(["00", "11"]);
  await page
    .getByRole("button", { name: "Switch to helper.py", exact: true })
    .click();
  await editor(page).fill(helper + "# unsaved dependency\n");
  await page
    .getByRole("button", { name: "Switch to main.py", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Save & run", exact: true }),
  ).toBeVisible();
  const savedRun = await runPython(page);
  expect(savedRun.status).toBe("completed");
  const project = await get(page, "/api/projects/" + savedRun.project.id);
  expect(project.files.find((file) => file.path === "helper.py").revision).toBe(
    savedRun.project.files.find((file) => file.path === "helper.py").sha256,
  );
  await page
    .getByRole("button", { name: "Switch to helper.py", exact: true })
    .click();
  await expect(editor(page)).toHaveValue(helper + "# unsaved dependency\n");
  await page.reload();
  await expect(editor(page)).toHaveValue(helper + "# unsaved dependency\n");
  await page
    .getByRole("button", { name: "Switch to main.py", exact: true })
    .click();
  const local = main + "# Newer user draft\n";
  await editor(page).fill(local);
  await page
    .getByRole("button", { name: "FlagQAI Agent", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Connect Agent", exact: true })
    .click();
  await expect(
    page.getByRole("status", { name: "Connected", exact: true }),
  ).toBeVisible();
  const input = page.getByRole("textbox", {
    name: "Message FlagQAI",
    exact: true,
  });
  await input.fill(
    "Run project acceptance and verify the actual saved project artifact.",
  );
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.locator(".fq-agent-message.assistant")).toContainText(
    "Scripted project acceptance completed with actual SDK computation.",
    { timeout: 90000 },
  );
  await expect(editor(page)).toHaveValue(local);
  await page
    .getByRole("button", { name: "Review changes in helper.py", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Review Agent code changes" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Accept changes", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Review changes in helper.py",
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Switch to main.py", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Switch to helper.py", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Review Agent code changes" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Review changes in main.py", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Keep my draft", exact: true })
    .click();
  await expect(editor(page)).toHaveValue(local);
  await expect(
    page.getByRole("button", {
      name: "Review changes in main.py",
      exact: true,
    }),
  ).toHaveCount(0);
  // Save & run writes the reviewed entry and includes the Agent's saved helper.
  const final = await runPython(page);
  expect(final.status).toBe("completed");
  expect(final.project.snapshot_hash).not.toBe(first.project.snapshot_hash);
  const record = await savedRecord(page, final);
  expect(Object.keys(record.job.result.counts).sort()).toEqual(["01", "10"]);
  await expect(page.getByText("Run complete", { exact: true })).toBeVisible();
  await editor(page).fill(local + "# changed after run\n");
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "These results are from an earlier snapshot" }),
  ).toBeVisible();
  await editor(page).fill(local);
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "These results are from an earlier snapshot" }),
  ).toHaveCount(0);
  await openCircuit(page, final);
  await expect(
    page.getByText("PROJECT SNAPSHOT", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/#program$/);
  await page.getByRole("button", { name: "MODEL", exact: true }).click();
  await expect(editor(page)).toHaveValue(local);
  await page
    .getByRole("button", {
      name: "Close main.py (draft retained)",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Open project workspace", exact: true })
    .click();
  await page.getByRole("button", { name: "Open main.py", exact: true }).click();
  await expect(editor(page)).toHaveValue(local);
});

test("workspace restores file view and folds; keyboard file search and save-and-run preserve source", async ({
  page,
}, testInfo) => {
  const main =
    Array.from({ length: 140 }, (_, index) => `# Context line ${index}`).join(
      "\n",
    ) +
    "\n" +
    bell +
    "# " +
    "long comment ".repeat(100);
  const helper = "# Project helper\nVALUE = 1\n";
  await page
    .getByRole("button", { name: "Open project workspace", exact: true })
    .click();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page.getByRole("button", { name: "Create new", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Project directory", exact: true })
    .fill("continuity-project");
  await page
    .getByRole("button", { name: "Create folder", exact: true })
    .click();
  const create = async (path, source) => {
    await page.getByRole("button", { name: "New file", exact: true }).click();
    await page
      .getByRole("textbox", { name: "New project file", exact: true })
      .fill(path);
    await page
      .getByRole("button", { name: "Create project file", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Switch to " + path, exact: true }),
    ).toBeVisible();
    await editor(page).fill(source);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      page.getByRole("status").filter({ hasText: /^Saved$/ }),
    ).toBeVisible();
  };
  await create("src/main.py", main);
  await create("helper.py", helper);
  const newFileButton = page.getByRole("button", {
    name: "New file",
    exact: true,
  });
  await newFileButton.click();
  const pendingFile = page.getByRole("textbox", {
    name: "New project file",
    exact: true,
  });
  await pendingFile.fill("pending.py");
  await pendingFile.evaluate((element) =>
    element.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        isComposing: true,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  await expect(pendingFile).toHaveValue("pending.py");
  await expect(pendingFile).toBeFocused();
  await pendingFile.press("Escape");
  await expect(pendingFile).toHaveCount(0);
  await expect(newFileButton).toBeFocused();
  await expect(editor(page)).toHaveValue(helper);
  await newFileButton.click();
  await pendingFile.fill("helper.py");
  let createRequests = 0;
  let releaseCreate;
  const createGate = new Promise((resolve) => {
    releaseCreate = resolve;
  });
  const createRoute = "**/api/projects/*/file";
  await page.route(createRoute, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    createRequests++;
    await createGate;
    await route.fulfill({
      status: 503,
      json: { error: "File creation temporarily unavailable" },
    });
  });
  try {
    const compositionContinues = await pendingFile.evaluate((element) =>
      element.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          isComposing: true,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    expect(compositionContinues).toBe(false);
    expect(createRequests).toBe(0);
    await pendingFile.press("Enter");
    await expect(
      page.getByRole("button", { name: "Create project file", exact: true }),
    ).toHaveText("Creating…");
    await expect(pendingFile).toHaveAttribute("readonly", "");
    await pendingFile.press("Enter");
    expect(createRequests).toBe(1);
    releaseCreate();
    await expect(
      page.locator(".fq-project-explorer").getByRole("alert"),
    ).toHaveText("File creation temporarily unavailable");
    await expect(pendingFile).toHaveValue("helper.py");
    await expect(pendingFile).not.toHaveAttribute("readonly");
    await expect(editor(page)).toHaveValue(helper);
  } finally {
    releaseCreate();
    await page.unroute(createRoute);
  }
  await pendingFile.press("Enter");
  await expect(
    page.locator(".fq-project-explorer").getByRole("alert"),
  ).toContainText("already exists");
  await expect(pendingFile).toHaveValue("helper.py");
  await expect(editor(page)).toHaveValue(helper);
  await pendingFile.press("Escape");
  // Tab must indent selected code, never replace it with whitespace.
  await editor(page).focus();
  await editor(page).evaluate((element) => {
    element.setSelectionRange(0, element.value.length, "backward");
  });
  await editor(page).press("Tab");
  await expect(editor(page)).toHaveValue(
    "    # Project helper\n    VALUE = 1\n",
  );
  await expect
    .poll(() =>
      editor(page).evaluate((element) => ({
        start: element.selectionStart,
        end: element.selectionEnd,
        direction: element.selectionDirection,
      })),
    )
    .toEqual({ start: 4, end: helper.length + 8, direction: "backward" });
  await editor(page).press("Shift+Tab");
  await expect(editor(page)).toHaveValue(helper);
  await expect
    .poll(() => editor(page).evaluate((element) => element.selectionStart))
    .toBe(0);
  await editor(page).evaluate((element) => element.setSelectionRange(0, 0));
  await editor(page).press("Tab");
  await expect(editor(page)).toHaveValue("    " + helper);
  await editor(page).press("Shift+Tab");
  await expect(editor(page)).toHaveValue(helper);
  for (let repeat = 0; repeat < 5; repeat++) {
    await editor(page).press("Tab");
    await editor(page).press("Shift+Tab");
  }
  await expect(editor(page)).toHaveValue(helper);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const retainedHelper = helper + "# retained after closing\n";
  await editor(page).fill(retainedHelper);
  await page
    .getByRole("button", {
      name: "Close helper.py (draft retained)",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Switch to helper.py", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(editor(page)).toHaveValue(main);
  const retainedDrafts = page.getByRole("button", {
    name: "Retained drafts (1)",
    exact: true,
  });
  await retainedDrafts.click();
  const draftDialog = page.getByRole("dialog", {
    name: "Retained project drafts",
    exact: true,
  });
  await expect(draftDialog).toContainText("Unsaved changes");
  await page.screenshot({
    path: testInfo.outputPath("retained-drafts.png"),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(draftDialog).toHaveCount(0);
  await expect(retainedDrafts).toBeFocused();
  await expect(editor(page)).toHaveValue(main);
  await retainedDrafts.click();
  await page.route("**/api/projects/*/file?*", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Acceptance file read unavailable" }),
    }),
  );
  await draftDialog
    .getByRole("button", {
      name: "Reopen continuity-project / helper.py",
      exact: true,
    })
    .click();
  await expect(draftDialog).toHaveCount(0);
  await expect(editor(page)).toHaveValue(retainedHelper);
  await expect(retainedDrafts).toHaveCount(0);
  await page.unroute("**/api/projects/*/file?*");
  await editor(page).fill(helper);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const tabs = page.locator(".fq-project-tabs > div > button:first-child");
  const order = await tabs.allTextContents();
  await page
    .getByRole("button", { name: "Switch to src/main.py", exact: true })
    .click();
  await editor(page).press("Control+End");
  await editor(page).press("Shift+ArrowLeft");
  const view = () =>
    editor(page).evaluate((element) => ({
      start: element.selectionStart,
      end: element.selectionEnd,
      direction: element.selectionDirection,
      top: Math.round(element.scrollTop),
      left: Math.round(element.scrollLeft),
    }));
  const position = await view();
  expect(position.top).toBeGreaterThan(500);
  expect(position.left).toBeGreaterThan(100);
  expect(position.direction).toBe("backward");
  await editor(page).press("Tab");
  await expect.poll(view).toEqual({
    ...position,
    start: position.start + 4,
    end: position.end + 4,
  });
  await editor(page).press("Shift+Tab");
  await expect(editor(page)).toHaveValue(main);
  await expect.poll(view).toEqual(position);
  await page
    .getByRole("button", { name: "Switch to helper.py", exact: true })
    .click();
  await editor(page).press("Control+Home");
  await page
    .getByRole("button", { name: "Switch to src/main.py", exact: true })
    .click();
  await expect.poll(view).toEqual(position);
  const folder = page
    .locator("details.fq-project-folder")
    .filter({ has: page.locator("summary").filter({ hasText: /^src$/ }) });
  await folder.locator("summary").click();
  await expect(folder).not.toHaveAttribute("open");
  const treeSearch = page.getByRole("textbox", {
    name: "Find project file",
    exact: true,
  });
  await treeSearch.fill("  SRC  ");
  await expect(folder).toHaveAttribute("open");
  await expect(
    page.getByRole("button", { name: "Open src/main.py", exact: true }),
  ).toBeVisible();
  await treeSearch.evaluate((element) =>
    element.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        isComposing: true,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  await expect(treeSearch).toHaveValue("  SRC  ");
  await treeSearch.press("Escape");
  await expect(treeSearch).toHaveValue("");
  await expect(treeSearch).toBeFocused();
  await expect(folder).not.toHaveAttribute("open");
  await treeSearch.fill("no-such-project-file");
  await expect(
    page.getByRole("status").filter({ hasText: /^No matching files\./ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Clear project file search", exact: true })
    .click();
  await expect(treeSearch).toHaveValue("");
  await expect(treeSearch).toBeFocused();
  await expect(folder).not.toHaveAttribute("open");
  await expect.poll(view).toEqual(position);
  await editor(page).press("Control+p");
  const search = page.getByRole("combobox", { name: "Find file", exact: true });
  await search.fill("helper");
  expect(
    await page
      .locator(".fq-quick-open")
      .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
  ).toBe(true);
  await search.press("ArrowDown");
  let releaseFileRead;
  const fileReadGate = new Promise((resolve) => {
    releaseFileRead = resolve;
  });
  const helperReads = "**/api/projects/*/file?path=helper.py";
  await page.route(helperReads, async (route) => {
    const response = await route.fetch();
    await fileReadGate;
    await route.fulfill({ response });
  });
  try {
    await search.press("Enter");
    await expect(
      page.getByRole("dialog", { name: "Find project file", exact: true }),
    ).toContainText("Opening…");
    await search.press("Escape");
    await editor(page).press("Control+p");
    await search.fill("src main");
    const pendingSearch = page.getByRole("dialog", {
      name: "Find project file",
      exact: true,
    });
    await expect(pendingSearch).toContainText(
      "Waiting for current project operation…",
    );
    await expect(pendingSearch.getByRole("option").first()).toBeDisabled();
    await search.press("Enter");
    await expect(search).toHaveValue("src main");
    await expect(pendingSearch).toBeVisible();
    releaseFileRead();
    await expect(editor(page)).toHaveValue(helper);
    await expect(search).toBeVisible();
    await expect(search).toHaveValue("src main");
    await expect(search).toBeFocused();
    await expect(pendingSearch.getByRole("option").first()).toBeEnabled();
    await search.press("Escape");
  } finally {
    releaseFileRead();
    await page.unroute(helperReads);
  }
  await expect(editor(page)).toHaveValue(helper);
  await expect(tabs).toHaveText(order);
  await editor(page).press("Control+p");
  await search.fill("src main");
  const mainReads = "**/api/projects/*/file?*";
  let mainOffline = true;
  await page.route(mainReads, (route) => {
    if (
      mainOffline &&
      new URL(route.request().url()).searchParams.get("path") === "src/main.py"
    )
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Acceptance main read failed" }),
      });
    return route.continue();
  });
  try {
    await search.press("Enter");
    const openError = page.locator(".fq-quick-error");
    await expect(openError).toContainText("Could not refresh src/main.py");
    await expect(openError).toContainText("Acceptance main read failed");
    await expect(
      page
        .locator(".fq-project-explorer")
        .getByRole("alert")
        .filter({ hasText: "Acceptance main read failed" }),
    ).toHaveCount(1);
    // The editor keeps its sync warning, rather than repeating it as an alert.
    await expect(
      page.locator(".fq-editor-sync").getByRole("status"),
    ).toContainText("Acceptance main read failed");
    await expect(page.locator(".fq-project-error")).toHaveCount(0);
    await expect(editor(page)).toHaveValue(main);
    await search.fill("helper");
    await expect(openError).toHaveCount(0);
    await search.fill("src main");
    await search.press("Enter");
    await expect(openError).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("file-read-retry.png"),
      fullPage: true,
    });
    mainOffline = false;
    await page
      .getByRole("button", { name: "Retry opening src/main.py", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Find project file", exact: true }),
    ).toHaveCount(0);
  } finally {
    mainOffline = false;
    await page.unroute(mainReads);
  }
  await expect(editor(page)).toHaveValue(main);
  await expect.poll(view).toEqual(position);
  await page.reload();
  await expect(editor(page)).toHaveValue(main);
  await expect.poll(view).toEqual(position);
  await expect(tabs).toHaveText(order);
  await expect(folder).not.toHaveAttribute("open");
  await page.getByRole("button", { name: "QUANTUM", exact: true }).click();
  await page.getByRole("button", { name: "MODEL", exact: true }).click();
  await expect.poll(view).toEqual(position);
  await page
    .getByRole("button", { name: "Switch to helper.py", exact: true })
    .click();
  await editor(page).fill(helper + "# unsaved dependency\n");
  await page
    .getByRole("button", { name: "Switch to src/main.py", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Save & run", exact: true }),
  ).toBeVisible();
  const before = new Set(
    (await get(page, "/api/python/runs")).map((run) => run.id),
  );
  await editor(page).press("Control+Enter");
  let run;
  await expect
    .poll(
      async () => {
        run = (await get(page, "/api/python/runs")).find(
          (item) => !before.has(item.id),
        );
        return run?.status || "not submitted";
      },
      { timeout: 90000 },
    )
    .not.toMatch(/^(not submitted|queued|running)$/);
  run = await get(page, "/api/python/runs/" + run.id);
  expect(run.status, JSON.stringify(run)).toBe("completed");
  expect(run.source).toBe(main);
  await expect(editor(page)).toHaveValue(main);
  const tree = await get(page, "/api/projects/" + run.project.id);
  expect(tree.files.find((file) => file.path === "helper.py").revision).toBe(
    run.project.files.find((file) => file.path === "helper.py").sha256,
  );
  await expect(page.getByText("Run complete", { exact: true })).toBeVisible();
  await editor(page).press("Control+p");
  await search.fill("does-not-exist");
  await expect(
    page.getByText("No matching files.", { exact: true }),
  ).toBeVisible();
  const imeEscapePrevented = await search.evaluate((element) => {
    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      isComposing: true,
      bubbles: true,
      cancelable: true,
    });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(imeEscapePrevented).toBe(true);
  await expect(
    page.getByRole("dialog", { name: "Find project file" }),
  ).toBeVisible();
  await expect(search).toHaveValue("does-not-exist");
  await expect(search).toBeFocused();
  await search.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Find project file" }),
  ).toHaveCount(0);
  const runsBeforeFind = (await get(page, "/api/python/runs")).map(
    (item) => item.id,
  );
  await editor(page).press("Control+f");
  const codeSearch = page.getByRole("textbox", {
    name: "Find in current code",
    exact: true,
  });
  const codeMatches = page.getByRole("status", {
    name: "Code search matches",
    exact: true,
  });
  await codeSearch.fill("Context line");
  await expect(codeMatches).toHaveText("1 of 140");
  await codeSearch.press("Enter");
  await expect(codeMatches).toHaveText("2 of 140");
  await codeSearch.press("Shift+Enter");
  await expect(codeMatches).toHaveText("1 of 140");
  await codeSearch.press("Shift+Enter");
  await expect(codeMatches).toHaveText("140 of 140");
  await expect(codeSearch).toBeFocused();
  await expect
    .poll(() =>
      page
        .locator(".fq-code-search-match")
        .first()
        .evaluate((element) => {
          const match = element.getBoundingClientRect();
          const editor = document
            .querySelector('textarea[aria-label="Quantum model code editor"]')
            .getBoundingClientRect();
          return match.top >= editor.top && match.bottom <= editor.bottom;
        }),
    )
    .toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("code-search.png"),
    fullPage: true,
  });
  await codeSearch.fill("does-not-exist");
  await expect(codeMatches).toHaveText("No matches");
  await expect(
    page.getByRole("button", { name: "Next code match", exact: true }),
  ).toBeDisabled();
  await codeSearch.fill("IMPORT");
  await expect(codeMatches).toHaveText("1 of 1");
  await page.getByRole("button", { name: "Match case", exact: true }).click();
  await expect(codeMatches).toHaveText("No matches");
  await page.getByRole("button", { name: "Match case", exact: true }).click();
  await codeSearch.fill("as fq");
  await expect
    .poll(async () =>
      (await page.locator(".fq-code-search-match").allTextContents()).join(""),
    )
    .toBe("as fq");
  await codeSearch.press("Escape");
  await expect(codeSearch).toHaveCount(0);
  await expect(editor(page)).toBeFocused();
  await expect(editor(page)).toHaveValue(main);
  await editor(page).press("Control+f");
  await expect(codeSearch).toHaveValue("as fq");
  // Searching must not take the caret back when editing, or exit focused mode.
  const focusEditor = page.getByRole("button", {
    name: "Focus model editor",
    exact: true,
  });
  await focusEditor.click();
  await expect(focusEditor).toHaveAttribute("aria-pressed", "true");
  await editor(page).focus();
  await editor(page).evaluate((element) =>
    element.setSelectionRange(element.value.length, element.value.length),
  );
  await editor(page).pressSequentially("# search stays passive");
  await expect(editor(page)).toHaveValue(main + "# search stays passive");
  expect(await editor(page).evaluate((element) => element.selectionStart)).toBe(
    (main + "# search stays passive").length,
  );
  await editor(page).evaluate((element) =>
    element.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        isComposing: true,
        bubbles: true,
      }),
    ),
  );
  await expect(codeSearch).toBeVisible();
  await expect(focusEditor).toHaveAttribute("aria-pressed", "true");
  await editor(page).press("Escape");
  await expect(codeSearch).toHaveCount(0);
  await expect(focusEditor).toHaveAttribute("aria-pressed", "true");
  await expect(editor(page)).toBeFocused();
  await editor(page).fill(main);
  await focusEditor.click();
  await editor(page).press("Control+f");
  await page
    .getByRole("button", { name: "Close code search", exact: true })
    .click();
  await expect(editor(page)).toHaveValue(main);
  expect((await get(page, "/api/python/runs")).map((item) => item.id)).toEqual(
    runsBeforeFind,
  );
  let saves = 0,
    releaseSave;
  const saveGate = new Promise((resolve) => {
    releaseSave = resolve;
  });
  await page.route("**/api/projects/*/file", async (route) => {
    if (route.request().method() === "POST") {
      saves++;
      await saveGate;
    }
    await route.continue();
  });
  const saveKey = (extra = {}) =>
    editor(page).evaluate((element, extra) => {
      const event = new KeyboardEvent("keydown", {
        key: "s",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
        ...extra,
      });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    }, extra);
  try {
    const source = main + "\n# keyboard save acceptance\n";
    await editor(page).fill(source);
    for (const extra of [
      { isComposing: true },
      { altKey: true },
      { shiftKey: true },
    ])
      expect(await saveKey(extra)).toBe(false);
    expect(await saveKey({ repeat: true })).toBe(true);
    await page.waitForTimeout(150);
    expect(saves).toBe(0);
    await editor(page).press("Control+s");
    await expect.poll(() => saves).toBe(1);
    await expect(
      page.getByRole("button", { name: "Save", exact: true }),
    ).toBeDisabled();
    expect(await saveKey()).toBe(true);
    expect(await saveKey({ repeat: true })).toBe(true);
    await page.waitForTimeout(150);
    expect(saves).toBe(1);
    releaseSave();
    await expect(
      page.getByRole("button", { name: "Save", exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByRole("status").filter({ hasText: /^Saved$/ }),
    ).toBeVisible();
    expect(await saveKey({ repeat: true })).toBe(true);
    await page.waitForTimeout(150);
    expect(saves).toBe(1);
    await expect(editor(page)).toHaveValue(source);
  } finally {
    releaseSave();
    await page.unroute("**/api/projects/*/file");
  }
  // A large read-only tree fixture checks the visible limit without creating files.
  const treePath = "/api/projects/" + run.project.id;
  const savedTree = await get(page, treePath);
  await page.route("**" + treePath, (route) =>
    route.fulfill({
      json: {
        ...savedTree,
        files: [
          ...savedTree.files,
          ...Array.from({ length: 45 }, (_, index) => ({
            path: `large-list-${String(index).padStart(2, "0")}.py`,
            kind: "source",
            size: 0,
          })),
        ],
      },
    }),
  );
  try {
    await editor(page).press("Control+p");
    const fileDialog = page.getByRole("dialog", {
      name: "Find project file",
      exact: true,
    });
    await expect(fileDialog.getByRole("status")).toContainText(
      "Showing 40 of 47 matching files",
    );
    await expect(fileDialog.getByRole("option")).toHaveCount(40);
    await search.press("End");
    await expect(fileDialog.getByRole("option").last()).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await search.press("Home");
    await expect(fileDialog.getByRole("option").first()).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await search.fill("large-list-44.py");
    await expect(fileDialog.getByRole("status")).toHaveText("1 matching file");
    await expect(fileDialog.getByRole("option")).toHaveCount(1);
    await page.screenshot({
      path: testInfo.outputPath("file-match-count.png"),
      fullPage: true,
    });
    await search.press("Escape");
  } finally {
    await page.unroute("**" + treePath);
  }
  await newFileButton.click();
  await pendingFile.fill("old-project-only.py");
  const projectSearch = page.getByRole("textbox", {
    name: "Find project file",
    exact: true,
  });
  await projectSearch.fill("helper");
  await page
    .getByRole("button", { name: "Change project", exact: true })
    .click();
  await page.getByRole("button", { name: "Create new", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Project directory", exact: true })
    .fill("new-file-scope-project");
  await page
    .getByRole("button", { name: "Create folder", exact: true })
    .click();
  await expect(pendingFile).toHaveCount(0);
  await expect(projectSearch).toHaveValue("");
  await newFileButton.click();
  await expect(pendingFile).toHaveValue("");
  await pendingFile.press("Escape");
  await expect(newFileButton).toBeFocused();
  const changeProject = page.getByRole("button", {
    name: "Change project",
    exact: true,
  });
  await changeProject.click();
  const chooser = page.getByRole("dialog", {
    name: "Open local project",
    exact: true,
  });
  const directory = chooser.getByRole("textbox", {
    name: "Project directory",
    exact: true,
  });
  let releaseProject;
  let projectRequests = 0;
  const projectGate = new Promise((resolve) => {
    releaseProject = resolve;
  });
  await page.route("**/api/projects", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    projectRequests++;
    const response = await route.fetch();
    await projectGate;
    await route.fulfill({ response });
  });
  try {
    await chooser
      .getByRole("button", { name: "Open folder", exact: true })
      .click();
    await expect(
      chooser.getByRole("button", { name: "Opening…", exact: true }),
    ).toBeDisabled();
    await directory.press("Escape");
    await expect(chooser).toHaveCount(0);
    await changeProject.click();
    await directory.fill("keep-this-folder");
    await expect(
      chooser.getByRole("button", { name: "Waiting…", exact: true }),
    ).toBeDisabled();
    await directory.press("Enter");
    expect(projectRequests).toBe(1);
    releaseProject();
    await expect(
      chooser.getByRole("button", { name: "Open folder", exact: true }),
    ).toBeEnabled();
    await expect(directory).toHaveValue("keep-this-folder");
    await expect(directory).toBeFocused();
    const defaultAllowed = await directory.evaluate((element) =>
      element.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          isComposing: true,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    expect(defaultAllowed).toBe(false);
    expect(projectRequests).toBe(1);
    await directory.press("Escape");
    await expect(changeProject).toBeFocused();
  } finally {
    releaseProject();
    await page.unroute("**/api/projects");
  }
  await changeProject.click();
  let releaseOldFailure;
  const oldFailureGate = new Promise((resolve) => {
    releaseOldFailure = resolve;
  });
  await page.route("**/api/projects", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await oldFailureGate;
    await route.fulfill({
      status: 503,
      json: { error: "Previous folder could not be opened" },
    });
  });
  try {
    await chooser
      .getByRole("button", { name: "Open folder", exact: true })
      .click();
    await expect(
      chooser.getByRole("button", { name: "Opening…", exact: true }),
    ).toBeDisabled();
    await directory.fill("newer-folder-choice");
    releaseOldFailure();
    await expect(
      chooser.getByRole("button", { name: "Open folder", exact: true }),
    ).toBeEnabled();
    await expect(directory).toHaveValue("newer-folder-choice");
    await expect(directory).toHaveAttribute("aria-invalid", "false");
    await expect(chooser.getByRole("alert")).toHaveCount(0);
  } finally {
    releaseOldFailure();
    await page.unroute("**/api/projects");
  }
  await directory.fill("missing-folder-for-chooser-recovery");
  await directory.press("Enter");
  await expect(chooser.getByRole("alert")).toBeVisible();
  await expect(directory).toHaveAttribute("aria-invalid", "true");
  await directory.fill("new-file-scope-project");
  await expect(chooser.getByRole("alert")).toHaveCount(0);
  await expect(directory).toHaveAttribute("aria-invalid", "false");
  await directory.press("Enter");
  await expect(chooser).toHaveCount(0);
  await expect(changeProject).toBeFocused();
});

test("failed run → Agent repair → review and undo → changed SDK result remains traceable after refresh", async ({
  page,
}) => {
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
  const failed = await runPython(
    page,
    "# repair-case: syntax\nimport flagquantum as fq\nfq.Circuit(",
  );
  expect(failed.status).toBe("failed");
  await page
    .getByRole("button", { name: "Ask Agent to fix", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Message FlagQAI", exact: true }),
  ).toHaveValue(new RegExp(failed.id.slice(0, 8)));
  await editor(page).fill(draft);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.locator(".fq-agent-message.assistant")).toContainText(
    "Repaired failed run " + failed.id,
    { timeout: 90000 },
  );
  await expect(page).toHaveURL(/#program$/);
  await expect(
    page.getByText("Differs from editor", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".fq-agent-work > summary")).toContainText(
    "Worked",
  );
  const completed = (await get(page, "/api/python/runs")).find(
    (item) => item.id !== failed.id && item.status === "completed",
  );
  expect(completed).toBeTruthy();
  const repaired = await get(page, "/api/python/runs/" + completed.id);
  const original = await savedRecord(page, repaired, "repaired.fqx");
  expect(Object.keys(original.job.result.counts).sort()).toEqual(["00", "11"]);
  await page.reload();
  await expect(page).toHaveURL(/#program$/);
  await expect(agent).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".fq-agent-message.assistant")).toContainText(
    "Repaired failed run " + failed.id,
  );
  await expect(
    page.getByRole("link", { name: "Download original .fqx ↓" }),
  ).toHaveAttribute("href", `/api/experiments/${original.id}/file`);
  await page.getByRole("button", { name: "MODEL", exact: true }).click();
  await expect(editor(page)).toHaveValue(draft);
  await page
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Accept Agent changes", exact: true })
    .click();
  await expect(editor(page)).toHaveValue(repaired.source);
  const staleResult = page
    .getByRole("status")
    .filter({ hasText: "These results are from an earlier snapshot" });
  await expect(staleResult).toHaveCount(0);
  await page
    .getByRole("button", { name: "Undo Agent change", exact: true })
    .click();
  await expect(editor(page)).toHaveValue(draft);
  await expect(staleResult).toBeVisible();
  await page.getByRole("button", { name: "View changes", exact: true }).click();
  const review = page.getByRole("dialog", {
    name: "Review Agent code changes",
  });
  await expect(review).toContainText("You undid this Agent change");
  await expect(review).not.toContainText("These changes have synced");
  await expect(review).not.toContainText(
    "You edited the code after synchronization",
  );
  await page.getByRole("button", { name: "Done", exact: true }).click();
  // Make an observable change and execute the actual edited source, rather than
  // reusing the Agent's saved Bell result or comparing only a success label.
  const changed = repaired.source.replace(
    "result = fq.run",
    "circuit.x(1)\nresult = fq.run",
  );
  const rerun = await runPython(page, changed);
  expect(rerun.status).toBe("completed");
  expect(rerun.source).toBe(changed);
  expect(rerun.source_hash).not.toBe(repaired.source_hash);
  const latest = await savedRecord(page, rerun, "repaired.fqx");
  expect(latest.id).not.toBe(original.id);
  expect(Object.keys(latest.job.result.counts).sort()).toEqual(["01", "10"]);
  await openCircuit(page, rerun, "repaired.fqx");
  await expect(page.getByText("Matches editor", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "View saved result →" }).click();
  await expect(page).toHaveURL(/#jobs$/);
  await page.reload();
  await expect(page).toHaveURL(/#jobs$/);
  const recoveredResult = await showJobEvidence(page);
  await expect(
    recoveredResult.getByRole("link", { name: "Download original .fqx ↓" }),
  ).toHaveAttribute("href", `/api/experiments/${latest.id}/file`);
  for (const count of Object.values(latest.job.result.counts))
    await expect(recoveredResult.getByRole("table")).toContainText(
      count.toLocaleString("en-US"),
    );
  await page.getByRole("button", { name: "MODEL", exact: true }).click();
  await expect(editor(page)).toHaveValue(changed);
  await page.getByLabel("Python run history").selectOption(failed.id);
  await expect(
    page.getByRole("region", { name: "Python failure", exact: true }),
  ).toBeVisible();
  await expect(editor(page)).toHaveValue(changed);
  expect((await get(page, "/api/python/runs/" + failed.id)).source).toBe(
    failed.source,
  );
  expect(
    (await savedRecord(page, repaired, "repaired.fqx")).job.result.counts,
  ).toEqual(original.job.result.counts);
});

test("native decisions, uncertain stops and reconnect preserve one task without resubmission", async ({
  page,
}) => {
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
  const input = page.getByRole("textbox", {
    name: "Message FlagQAI",
    exact: true,
  });
  const network = `http://127.0.0.1:${process.env.FQ_TEST_PROXY_PORT}/__fixture/network`;
  const start = await get(page, network);
  const send = async (kind) => {
    await input.fill("control acceptance: " + kind);
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
  };
  await send("permission");
  await expect(
    page.getByRole("status", { name: "Waiting for permission", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  await expect(
    page.getByRole("status", { name: "Connected", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".fq-agent-message.assistant")).toContainText(
    "The read was rejected",
  );
  await send("question");
  await expect(
    page.getByRole("status", { name: "Waiting for your answer", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stop Agent", exact: true }).click();
  await expect(
    page.getByText("Agent stopped. Existing code and results are retained.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Submit answers", exact: true }),
  ).toHaveCount(0);
  for (const kind of ["unknown", "failed"]) {
    await send("stop-" + kind);
    await expect(
      page.getByRole("button", { name: "Stop Agent", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Stop Agent", exact: true }).click();
    await expect(page.locator(".fq-agent-stop-state")).toContainText(
      kind === "unknown" ? "Stop is unconfirmed" : "Stop failed",
    );
    await expect(page.locator(".fq-agent-stop-state")).not.toContainText(
      "Agent stopped",
    );
    if (kind === "unknown")
      await expect(page.locator(".fq-agent-stop-state")).toContainText(
        "1 message remains queued",
      );
    const native = (await get(page, network)).sessions.find(
      (session) => session.status === "running",
    );
    expect(native).toBeTruthy();
    await input.fill("Keep this unsent draft while stopping.");
    await editor(page).fill(draft);
    // Drop the live stream, then restore it. Neither reconnect nor refresh may
    // create another native submission or silently retry the stop request.
    const beforeReconnect = await get(page, network);
    try {
      await page.request.post(network, { data: { offline: true } });
      await expect(
        page.getByRole("status", { name: "Reconnecting…", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Stop Agent", exact: true }),
      ).toBeDisabled();
    } finally {
      await fetch(network, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offline: false }),
        signal: AbortSignal.timeout(5000),
      });
    }
    await page.reload();
    await expect(
      page.getByRole("status", { name: "Working", exact: true }),
    ).toBeVisible();
    await expect(input).toHaveValue("Keep this unsent draft while stopping.");
    await expect(editor(page)).toHaveValue(draft);
    const restored = await get(page, network);
    expect(restored.submissionCount).toBe(beforeReconnect.submissionCount);
    expect(restored.cancellationCount).toBe(beforeReconnect.cancellationCount);
    expect(
      restored.sessions.find((session) => session.id === native.id)?.status,
    ).toBe("running");
    await page.getByRole("button", { name: "Stop Agent", exact: true }).click();
    await expect(
      page.getByText("Agent stopped. Existing code and results are retained.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("status", { name: "Connected", exact: true }),
    ).toBeVisible();
  }
  const hold = join(process.env.FQ_E2E_CONTROL_DIR, "hold-stop");
  await writeFile(
    hold,
    "Keep native turn running after the confirmed cancellation receipt",
  );
  try {
    await send("stop-delayed");
    const beforeStop = await get(page, network);
    await page.getByRole("button", { name: "Stop Agent", exact: true }).click();
    await expect(
      page.getByRole("status", { name: "Stopping…", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".fq-agent-stop-state")).toContainText(
      "Waiting for the native Agent to finish",
    );
    await expect(
      page.getByRole("button", { name: "Stop Agent", exact: true }),
    ).toBeDisabled();
    expect((await get(page, network)).cancellationCount).toBe(
      beforeStop.cancellationCount + 1,
    );
    await expect(page.locator(".fq-agent-stop-state")).not.toContainText(
      "Agent stopped",
    );
  } finally {
    await rm(hold, { force: true });
  }
  await expect(
    page.getByText("Agent stopped. Existing code and results are retained.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(editor(page)).toHaveValue(draft);
  expect((await get(page, network)).submissionCount).toBe(
    start.submissionCount + 5,
  );
});

test("Follow Agent from Execution handles the first action batch, cold archive focus and Follow Off", async ({
  page,
}) => {
  await editor(page).fill(draft);
  const agent = page.getByRole("button", {
    name: "FlagQAI Agent",
    exact: true,
  });
  if ((await agent.getAttribute("aria-expanded")) !== "true")
    await agent.click();
  // Delay the first live poll so it contains newly created actions, not just
  // history. Real protocol/SDK traffic is delayed, never replaced by fixtures.
  let identity;
  await page.route("**/api/workspace/context", async (route) => {
    identity = route.request().postDataJSON();
    await route.continue();
  });
  let polls = 0,
    releasePoll;
  const pollGate = new Promise((resolve) => {
    releasePoll = resolve;
  });
  await page.route("**/api/workspace/events?*", async (route) => {
    if (++polls === 2) await pollGate;
    await route.continue();
  });
  const modelBarrier = join(
    process.env.FQ_E2E_CONTROL_DIR,
    "hold-follow-model",
  );
  const resultBarrier = join(
    process.env.FQ_E2E_CONTROL_DIR,
    "hold-follow-result",
  );
  await writeFile(modelBarrier, "Observe model navigation");
  await writeFile(resultBarrier, "Observe circuit navigation");
  try {
    await page
      .getByRole("button", { name: "Connect Agent", exact: true })
      .click();
    await expect(
      page.getByRole("status", { name: "Connected", exact: true }),
    ).toBeVisible();
    const follow = page.getByRole("switch", { name: /Follow Agent/ });
    if ((await follow.getAttribute("aria-checked")) !== "true")
      await follow.click();
    await page.getByRole("button", { name: "EXECUTION", exact: true }).click();
    const input = page.getByRole("textbox", {
      name: "Message FlagQAI",
      exact: true,
    });
    await input.fill("follow acceptance");
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect
      .poll(async () => {
        if (!identity) return false;
        const actions = await get(
          page,
          `/api/workspace/events?client=${identity.client}&session=${identity.session}&after=0`,
        );
        return actions.some(
          (action) =>
            action.operation === "model.create" &&
            action.status === "completed",
        );
      })
      .toBe(true);
    releasePoll();
    await expect(page).toHaveURL(/#model$/);
    await expect(editor(page)).toHaveValue(
      /circuit = fq.Circuit\(2\).h\(0\).cx\(0, 1\).x\(1\)/,
    );
    await rm(modelBarrier, { force: true });
    await expect(page).toHaveURL(/#program$/, { timeout: 90000 });
    await expect(
      page.getByRole("button", { name: "Inspect X gate 3", exact: true }),
    ).toBeVisible();
    const archive = await page
      .getByRole("link", { name: "Download original .fqx ↓" })
      .getAttribute("href");
    await rm(resultBarrier, { force: true });
    await expect(page).toHaveURL(/#jobs$/);
    const followedResult = await showJobEvidence(page);
    await expect(
      followedResult.getByRole("link", { name: "Download original .fqx ↓" }),
    ).toHaveAttribute("href", archive);
    await expect(followedResult.getByRole("table")).toContainText("01");
    await expect(followedResult.getByRole("table")).toContainText("10");
    await expect(
      page.getByRole("status", { name: "Connected", exact: true }),
    ).toBeVisible();
    await follow.click();
    await page.getByRole("button", { name: "EXECUTION", exact: true }).click();
    await input.fill("follow acceptance");
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(page.locator(".fq-agent-message.assistant")).toHaveCount(2, {
      timeout: 90000,
    });
    await expect(
      page.getByRole("status", { name: "Connected", exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(/#execution$/);
    await page.reload();
    await expect(page).toHaveURL(/#execution$/);
    await expect(agent).toHaveAttribute("aria-expanded", "true");
    await page
      .getByRole("button", { name: "Show model library", exact: true })
      .click();
    await page.getByRole("button", { name: "MODEL", exact: true }).click();
    await expect(
      page.getByRole("button", {
        name: /Draft · Python Bell pair/,
        exact: false,
      }),
    ).toBeVisible();
  } finally {
    releasePoll();
    await rm(modelBarrier, { force: true });
    await rm(resultBarrier, { force: true });
  }
});

test("comparison task opens a durable side-by-side experiment with real gate and distribution changes", async ({
  page,
}, testInfo) => {
  await editor(page).fill(draft);
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
  await page.getByRole("button", { name: "EXECUTION", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Message FlagQAI", exact: true })
    .fill("comparison acceptance");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Experiment progress" }),
  ).toBeVisible();
  const comparison = page.getByRole("region", {
    name: "Experiment comparison",
    exact: true,
  });
  await expect(comparison).toBeVisible({ timeout: 90000 });
  await expect(
    comparison.getByRole("heading", {
      name: "1 added · 0 removed operations",
      exact: true,
    }),
  ).toBeVisible();
  await expect(comparison).toContainText("+ X on q1");
  await expect(comparison).toContainText("100.0%");
  await expect(
    page.getByRole("region", { name: "Experiment progress" }),
  ).toContainText("1 run · 2 saved results");
  await expect(
    comparison.getByRole("combobox", {
      name: "Baseline experiment",
      exact: true,
    }),
  ).toHaveValue(/fqx-/);
  const left = await comparison
    .getByRole("combobox", { name: "Baseline experiment", exact: true })
    .inputValue();
  const right = await comparison
    .getByRole("combobox", { name: "Variant experiment", exact: true })
    .inputValue();
  const a = await get(page, "/api/experiments/" + left),
    b = await get(page, "/api/experiments/" + right);
  expect(a.job.result.shots).not.toBe(b.job.result.shots);
  expect(Object.keys(a.job.result.counts).sort()).toEqual(["00", "11"]);
  expect(Object.keys(b.job.result.counts).sort()).toEqual(["01", "10"]);
  await page.screenshot({
    path: testInfo.outputPath("experiment-comparison.png"),
    fullPage: true,
  });
  await page.reload();
  await expect(comparison).toBeVisible();
  await expect(
    comparison.getByRole("combobox", {
      name: "Baseline experiment",
      exact: true,
    }),
  ).toHaveValue(left);
  await expect(
    comparison.getByRole("combobox", {
      name: "Variant experiment",
      exact: true,
    }),
  ).toHaveValue(right);
  await expect(
    page.getByRole("region", { name: "Experiment progress" }),
  ).toContainText("2 saved results");
  await comparison
    .getByRole("button", { name: "Swap comparison sides", exact: true })
    .click();
  await expect(
    comparison.getByRole("heading", {
      name: "0 added · 1 removed operations",
      exact: true,
    }),
  ).toBeVisible();
  await comparison
    .getByRole("button", { name: "Single result", exact: true })
    .click();
  await expect(comparison).toHaveCount(0);
  await page.getByRole("button", { name: "MODEL", exact: true }).click();
  await page
    .getByRole("button", { name: "Show model library", exact: true })
    .click();
  await page.getByRole("button", { name: /Draft · Python Bell pair/ }).click();
  await expect(editor(page)).toHaveValue(draft);
});

test("Jobs prioritizes results, filters history and compares only explicitly selected experiments", async ({
  page,
}, testInfo) => {
  const first = await runPython(
    page,
    bell.replace("bell.fqx", "jobs_reference.fqx"),
  );
  const second = await runPython(
    page,
    bell
      .replace("bell.fqx", "jobs_variant.fqx")
      .replace("result = fq.run", "circuit.x(1)\nresult = fq.run"),
  );
  const a = await savedRecord(page, first),
    b = await savedRecord(page, second);
  await editor(page).fill(draft);
  await page.getByRole("button", { name: "JOBS", exact: true }).click();
  await page
    .getByRole("button", { name: `Open job ${b.job.name}`, exact: true })
    .click();
  const results = page.getByRole("region", {
    name: "Job results",
    exact: true,
  });
  await expect(
    results.getByRole("region", { name: "Measurement distribution" }),
  ).toBeVisible();
  await expect(
    results.getByRole("link", { name: "Download original .fqx ↓" }),
  ).not.toBeVisible();
  await results.getByRole("button", { name: "Counts", exact: true }).click();
  await results.getByRole("button", { name: "Table", exact: true }).click();
  await expect(results.getByRole("table")).toContainText("Probability");
  await results.getByRole("button", { name: "Circuit", exact: true }).click();
  await expect(
    results.getByRole("group", { name: b.program.name + " circuit preview" }),
  ).toBeVisible();
  await results.getByRole("button", { name: "Code", exact: true }).click();
  await expect(
    results.getByLabel("Model used for this result code"),
  ).toContainText("circuit.x(1)");
  await results.getByRole("button", { name: "Results", exact: true }).click();
  await page.getByLabel("Filter jobs by status").selectOption("failed");
  await expect(
    page.getByText("No matching jobs. Try another search or status."),
  ).toBeVisible();
  await page.getByLabel("Filter jobs by status").selectOption("all");
  const compare = page.getByRole("button", {
    name: "Compare two experiments",
    exact: true,
  });
  await expect(compare).toBeDisabled();
  await page
    .getByRole("checkbox", { name: `Compare ${a.job.name}`, exact: true })
    .check();
  await page.getByLabel("Search jobs").fill("jobs_variant");
  await expect(
    page.getByRole("checkbox", { name: `Compare ${a.job.name}`, exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("checkbox", { name: `Compare ${b.job.name}`, exact: true })
    .check();
  await page.getByLabel("Search jobs").fill("");
  await page
    .getByRole("button", { name: "Compare 2 / 2", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Experiment comparison" }),
  ).toContainText("+ X on q1");
  await page
    .getByRole("button", { name: "Single result", exact: true })
    .click();
  await results.getByRole("button", { name: "Results", exact: true }).click();
  await page.screenshot({
    path: testInfo.outputPath("jobs-results.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "MODEL", exact: true }).click();
  await expect(editor(page)).toHaveValue(draft);
});

test("Jobs pages all observed states without renormalizing a truncated chart", async ({
  page,
}) => {
  const run = await runPython(
    page,
    `import flagquantum as fq
circuit = fq.Circuit(6)
for q in range(6):
    circuit.h(q)
result = fq.run(circuit, outputs=fq.counts(), options=fq.ExecutionOptions(shots=4096, seed=42))
fq.save("jobs_many_states.fqx", result.plan, result=result)
`,
  );
  const record = await savedRecord(page, run);
  expect(Object.keys(record.job.result.counts)).toHaveLength(64);
  await page.getByRole("button", { name: "JOBS", exact: true }).click();
  await page
    .getByRole("button", { name: `Open job ${record.job.name}`, exact: true })
    .click();
  const results = page.getByRole("region", {
    name: "Job results",
    exact: true,
  });
  await results.getByLabel("Sort measurement states").selectOption("state");
  await expect(results).toContainText("Showing 1–32 of 64 observed states");
  await expect(
    results.getByRole("button", { name: "Previous", exact: true }),
  ).toBeDisabled();
  const count = record.job.result.counts["000000"];
  await expect(
    results.getByRole("button", {
      name: `000000: ${count} shots, ${((count / 4096) * 100).toFixed(2)}%`,
      exact: true,
    }),
  ).toBeVisible();
  await results.getByRole("button", { name: "Next", exact: true }).click();
  await expect(results).toContainText("Showing 33–64 of 64 observed states");
  await expect(
    results.getByRole("button", { name: "Next", exact: true }),
  ).toBeDisabled();
  await results.getByRole("button", { name: "Table", exact: true }).click();
  await expect(results.getByRole("table")).toContainText("111111");
  await page.getByLabel("Search jobs").fill("no-such-job");
  await expect(
    page.getByText("No matching jobs. Try another search or status."),
  ).toBeVisible();
  await expect(results.getByRole("table")).toContainText("111111");
});

test("browser backup failure preserves the last snapshot and exposes recovery without losing the live draft", async ({
  page,
}) => {
  await editor(page).fill("# durable backup\nprint('saved')\n");
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("fq-react-workspace-v1")).source,
      ),
    )
    .toBe("# durable backup\nprint('saved')\n");
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    window.__restoreWorkspaceStorage = () => {
      Storage.prototype.setItem = original;
    };
    Storage.prototype.setItem = function (key, value) {
      if (key === "fq-react-workspace-v1")
        throw new DOMException("Test quota exhausted", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  const liveDraft =
    "# newer draft must stay in memory\nprint('not backed up yet')\n";
  await editor(page).fill(liveDraft);
  const notice = page.getByRole("alert", {
    name: "Workspace backup unavailable",
  });
  await expect(notice).toContainText("Browser storage is full");
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("fq-react-workspace-v1")).source,
    ),
  ).toBe("# durable backup\nprint('saved')\n");
  const downloadPromise = page.waitForEvent("download");
  await notice
    .getByRole("button", { name: "Download workspace backup" })
    .click();
  const downloaded = await downloadPromise;
  expect(downloaded.suggestedFilename()).toBe(
    "flagquantum-workspace-backup.json",
  );
  const { readFile } = await import("node:fs/promises");
  const backup = JSON.parse(await readFile(await downloaded.path(), "utf8"));
  expect(backup.source).toBe(liveDraft);
  expect(backup.schema).toBe("flagqai.quantum-workspace.v1");
  await expect(editor(page)).toHaveValue(liveDraft);
  await page.evaluate(() => window.__restoreWorkspaceStorage());
  await notice.getByRole("button", { name: "Retry backup" }).click();
  await expect(notice).toHaveCount(0);
  await page.reload();
  await expect(editor(page)).toHaveValue(liveDraft);
});

test("interaction craft keeps run feedback honest and preserves the result reading position", async ({
  page,
}, testInfo) => {
  const baseline = await runPython(
    page,
    bell.replace("bell.fqx", "craft_baseline.fqx"),
  );
  const record = await savedRecord(page, baseline);
  const gate = () => {
    let release;
    const promise = new Promise((resolve) => {
      release = resolve;
    });
    return { promise, release };
  };
  const submit = gate(),
    stop = gate(),
    history = gate();
  let cancellations = 0;
  const slow = `import time
for i in range(500):
    print(f"line {i}", flush=True)
for i in range(600):
    print(f"tick {i}", flush=True)
    time.sleep(0.1)
`;
  const output = page.getByRole("region", {
    name: "Python output",
    exact: true,
  });
  const status = output.getByRole("status", {
    name: "Python run status",
    exact: true,
  });
  try {
    await page.route("**/api/python/runs", async (route) => {
      if (route.request().method() === "POST") await submit.promise;
      await route.continue();
    });
    await editor(page).fill(slow);
    await page.getByRole("button", { name: "Run Python", exact: true }).click();
    await expect(status).toHaveText("Starting…");
    submit.release();
    await expect(status).toHaveText("Running…");
    const logs = output.getByLabel("Python console output", { exact: true });
    await expect(logs).toContainText("line 499");
    await logs.evaluate((element) => {
      element.scrollTop = 0;
      element.dispatchEvent(new Event("scroll"));
    });
    const latest = output.getByRole("button", {
      name: "Jump to latest Python output",
      exact: true,
    });
    await expect(latest).toBeEnabled();
    await latest.click();
    await expect(latest).toBeDisabled();
    await expect(logs).toBeFocused();
    await page.route("**/api/python/runs/*/cancel", async (route) => {
      cancellations++;
      await stop.promise;
      await route.continue();
    });
    await output.getByRole("button", { name: "Stop", exact: true }).click();
    await expect(
      output.getByRole("button", { name: "Stopping…", exact: true }),
    ).toBeDisabled();
    await expect(status).toHaveText("Stopping…");
    await output.screenshot({
      path: testInfo.outputPath("python-stopping.png"),
    });
    await expect.poll(() => cancellations).toBe(1);
    stop.release();
    await expect(status).toHaveText("Stopped");
    await expect(editor(page)).toHaveValue(slow);
    await page.route("**/api/python/runs/" + baseline.id, async (route) => {
      await history.promise;
      await route.continue();
    });
    await page.getByLabel("Python run history").selectOption(baseline.id);
    await expect(status).toHaveText("Loading run…");
    await expect(
      page.getByRole("button", { name: "Run Python", exact: true }),
    ).toBeDisabled();
    await expect(page.getByLabel("Python run history")).toHaveValue(
      baseline.id,
    );
    await expect(logs).toContainText("Loading the selected run");
    history.release();
    await expect(status).toHaveText("Completed");
    await page.getByRole("button", { name: "JOBS", exact: true }).click();
    await page
      .getByRole("button", { name: `Open job ${record.job.name}`, exact: true })
      .click();
    const results = page.getByRole("region", {
      name: "Job results",
      exact: true,
    });
    await results.getByRole("button", { name: "Table", exact: true }).click();
    await results.getByRole("button", { name: "Counts", exact: true }).click();
    await results.getByLabel("Sort measurement states").selectOption("state");
    await page.getByRole("button", { name: "MODEL", exact: true }).click();
    await expect(editor(page)).toHaveValue(slow);
    await page.getByRole("button", { name: "JOBS", exact: true }).click();
    await expect(
      results.getByRole("button", { name: "Table", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      results.getByRole("button", { name: "Counts", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await expect(
      results.getByRole("button", { name: "Table", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(results.getByLabel("Sort measurement states")).toHaveValue(
      "state",
    );
    await page.screenshot({
      path: testInfo.outputPath("interaction-craft.png"),
      fullPage: true,
    });
    const exports = results.getByRole("button", {
      name: "Export results",
      exact: true,
    });
    await exports.click();
    await expect(
      results.getByRole("button", { name: "JSON", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(exports).toHaveAttribute("aria-expanded", "false");
    await expect(exports).toBeFocused();
    await exports.click();
    await results
      .getByRole("heading", { name: record.job.name, exact: true })
      .click();
    await expect(exports).toHaveAttribute("aria-expanded", "false");
    const download = page.waitForEvent("download");
    await exports.click();
    await results.getByRole("button", { name: "JSON", exact: true }).click();
    const file = await download;
    const { readFile } = await import("node:fs/promises");
    expect(JSON.parse(await readFile(await file.path(), "utf8")).id).toBe(
      record.job.id,
    );
    await expect(exports).toHaveAttribute("aria-expanded", "false");
  } finally {
    submit.release();
    stop.release();
    history.release();
  }
});

test("model import explains invalid files and preserves the newest draft during file reads", async ({
  page,
}, testInfo) => {
  const agent = page.getByRole("button", {
    name: "FlagQAI Agent",
    exact: true,
  });
  if ((await agent.getAttribute("aria-expanded")) === "true")
    await agent.click();
  await editor(page).fill(draft);
  const upload = page.locator('.fq-library-body input[type="file"]').first();
  const modelSearch = page.getByRole("textbox", {
    name: "Search models",
    exact: true,
  });
  await modelSearch.fill("   ghz   ");
  await expect(
    page.locator(".fq-library-card").filter({ hasText: "GHZ State" }).first(),
  ).toBeVisible();
  await expect(
    page.locator(".fq-library-card").filter({ hasText: "Bell State" }),
  ).toHaveCount(0);
  await modelSearch.fill("no-model-with-this-name");
  await expect(
    page.getByRole("status").filter({ hasText: "No models match your search" }),
  ).toBeVisible();
  await modelSearch.evaluate((element) =>
    element.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        isComposing: true,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  await expect(modelSearch).toHaveValue("no-model-with-this-name");
  await page.screenshot({
    path: testInfo.outputPath("model-search-empty.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Clear model search", exact: true })
    .click();
  await expect(modelSearch).toHaveValue("");
  await expect(modelSearch).toBeFocused();
  await modelSearch.fill("ghz");
  await modelSearch.press("Escape");
  await expect(modelSearch).toHaveValue("");
  await expect(editor(page)).toHaveValue(draft);
  await page.getByRole("button", { name: "TEMPLATES", exact: true }).click();
  const description = page.getByRole("textbox", {
    name: "Template description",
    exact: true,
  });
  const generate = page.getByRole("button", {
    name: "Generate model →",
    exact: true,
  });
  await expect(generate).toBeDisabled();
  await description.fill("Bell pair");
  await generate.click();
  const applyTemplate = page.getByRole("button", {
    name: "Apply model →",
    exact: true,
  });
  await expect(applyTemplate).toBeVisible();
  await expect(
    page
      .locator(".fq-library-body .fq-code-example .fq-syntax-keyword")
      .first(),
  ).toHaveText("import");
  await description.fill("unsupported quantum task");
  await expect(applyTemplate).toHaveCount(0);
  await expect(page.locator(".fq-library-body .fq-code-example")).toHaveCount(
    0,
  );
  await generate.click();
  await expect(
    page.getByRole("alert").filter({ hasText: "No matching local template" }),
  ).toBeVisible();
  await description.fill("GHZ state");
  await expect(
    page.getByRole("alert").filter({ hasText: "No matching local template" }),
  ).toHaveCount(0);
  await generate.click();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const templateCode = await page
    .locator(".fq-library-body .fq-code-example pre")
    .textContent();
  await page
    .getByRole("button", { name: "Copy GHZ State", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(templateCode);
  await page.screenshot({
    path: testInfo.outputPath("template-preview.png"),
    fullPage: true,
  });
  await expect(editor(page)).toHaveValue(draft);
  await page.getByRole("button", { name: "MODELS", exact: true }).click();
  for (const [name, buffer, message] of [
    ["empty.py", Buffer.alloc(0), "This file is empty"],
    [
      "large.py",
      Buffer.alloc(32769, 32),
      "Source files must be no larger than 32 KiB",
    ],
    ["unsupported.bin", Buffer.from("data"), "Choose a Python"],
    ["encoding.py", Buffer.from([255, 254]), "not valid UTF-8"],
  ]) {
    await upload.setInputFiles({
      name,
      mimeType: "application/octet-stream",
      buffer,
    });
    const error = page.getByRole("alert").filter({ hasText: message });
    await expect(error).toHaveCount(1);
    await expect(error).toBeVisible();
    await expect(editor(page)).toHaveValue(draft);
  }
  await page.evaluate(() => {
    const read = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = function () {
      if (this.name === "unreadable.py")
        return Promise.reject(Error("Acceptance read error"));
      if (this.name === "upload.PY")
        return new Promise((resolve, reject) => {
          globalThis.__releaseSourceImport = () =>
            read.call(this).then(resolve, reject);
        });
      return read.call(this);
    };
  });
  await upload.setInputFiles({
    name: "unreadable.py",
    mimeType: "text/plain",
    buffer: Buffer.from("print(1)"),
  });
  await expect(page.getByRole("alert")).toContainText(
    "Could not read this file",
  );
  await page
    .getByRole("button", { name: "Dismiss import error", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  const imported = "import flagquantum as fq\n\nprint('imported')\n";
  await upload.setInputFiles({
    name: "upload.PY",
    mimeType: "text/plain",
    buffer: Buffer.from(imported),
  });
  await expect(
    page.getByRole("button", { name: "Importing file…", exact: true }),
  ).toBeDisabled();
  const newerDraft = draft + "# edited while the file was being read\n";
  await editor(page).fill(newerDraft);
  await page.evaluate(() => globalThis.__releaseSourceImport());
  await expect(editor(page)).toHaveValue(imported);
  await expect(
    page.getByRole("button", { name: "Python", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page
    .getByRole("button", { name: /Draft · / })
    .first()
    .click();
  await expect(editor(page)).toHaveValue(newerDraft);
  await page.reload();
  await expect(editor(page)).toHaveValue(newerDraft);
  await page.screenshot({
    path: testInfo.outputPath("import-draft-retained.png"),
    fullPage: true,
  });
});
