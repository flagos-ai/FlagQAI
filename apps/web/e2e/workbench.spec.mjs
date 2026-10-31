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
    await expect(
      page.getByRole("link", { name: "Download original .fqx ↓" }),
    ).toHaveAttribute("href", `/api/experiments/${record.id}/file`);
    for (const count of Object.values(counts))
      await expect(page.getByRole("table")).toContainText(String(count));
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
}) => {
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
  await page
    .getByRole("textbox", { name: "Find project file", exact: true })
    .fill("src");
  await expect(folder).toHaveAttribute("open");
  await page
    .getByRole("textbox", { name: "Find project file", exact: true })
    .fill("");
  await expect(folder).not.toHaveAttribute("open");
  await editor(page).press("Control+p");
  const search = page.getByRole("combobox", { name: "Find file", exact: true });
  await search.fill("helper");
  expect(
    await page
      .locator(".fq-quick-open")
      .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
  ).toBe(true);
  await search.press("ArrowDown");
  await search.press("Enter");
  await expect(editor(page)).toHaveValue(helper);
  await expect(tabs).toHaveText(order);
  await editor(page).press("Control+p");
  await search.fill("src main");
  await search.press("Enter");
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
  await search.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Find project file" }),
  ).toHaveCount(0);
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
  await expect(
    page.getByRole("link", { name: "Download original .fqx ↓" }),
  ).toHaveAttribute("href", `/api/experiments/${latest.id}/file`);
  for (const count of Object.values(latest.job.result.counts))
    await expect(page.getByRole("table")).toContainText(String(count));
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
    await expect(
      page.getByRole("link", { name: "Download original .fqx ↓" }),
    ).toHaveAttribute("href", archive);
    await expect(page.getByRole("table")).toContainText("01");
    await expect(page.getByRole("table")).toContainText("10");
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
