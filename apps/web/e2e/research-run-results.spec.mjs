import { test, expect } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function saveVerifiedRun(
  saved,
  id,
  task,
  score,
  pack = "Saved submission fixture",
) {
  const variants = await Promise.all(
    [
      ["baseline", 200],
      ["candidate", score],
    ].map(async ([name, score]) => {
      const circuit = Buffer.from(name + " circuit");
      const report = {
        status: "PASS",
        verified_shots: 200540928,
        circuit_sha256: sha256(circuit),
        score,
      };
      const output = JSON.stringify(report);
      await writeFile(join(saved, name + ".kmb"), circuit);
      await writeFile(join(saved, name + ".stdout.json"), output);
      return {
        name,
        seconds: 1,
        report,
        sha256: sha256(circuit),
        report_sha256: sha256(output),
      };
    }),
  );
  const source = "X q0 # " + id;
  await writeFile(join(saved, "candidate.kmx"), source);
  await writeFile(join(saved, "submission.zip"), pack);
  const verifier =
    "raise AssertionError('The review must not execute archived Python')\n";
  await writeFile(join(saved, "verifier.py"), verifier);
  await writeFile(join(saved, "official-metric.py"), verifier);
  await writeFile(
    join(saved, "report.json"),
    JSON.stringify({
      id,
      task,
      status: "completed",
      created_at: "2026-11-05T00:00:00Z",
      scope: "Local verification fixture",
      settings: { shots_per_x: 64, salt: "" },
      provenance: {
        verifier_sha256: sha256(verifier),
        metric_sha256: sha256(verifier),
      },
      variants,
      exports: [
        { name: "submission.zip", sha256: sha256(pack) },
        { name: "candidate.kmx", sha256: sha256(source) },
        { name: "verifier.py", sha256: sha256(verifier) },
        { name: "official-metric.py", sha256: sha256(verifier) },
        ...variants.flatMap((variant) => [
          { name: variant.name + ".kmb", sha256: variant.sha256 },
          {
            name: variant.name + ".stdout.json",
            sha256: variant.report_sha256,
          },
        ]),
      ],
    }),
  );
}

test("Jobs opens recorded research comparisons and retains failed attempts and drafts", async ({
  page,
}) => {
  const jobIds = async () => {
    const response = await page.request.get("/api/jobs");
    expect(response.ok()).toBe(true);
    return (await response.json()).map(({ id }) => id).sort();
  };
  const jobsBefore = await jobIds();
  const environment = await page.request.get("/api/agent");
  expect(environment.ok()).toBe(true);
  const { cwd } = await environment.json();
  expect(basename(cwd)).toMatch(/^flagqai-ui-test-/);
  const root = join(cwd, "invsqrt");
  const id = randomUUID().replaceAll("-", "");
  const failedId = randomUUID().replaceAll("-", "");
  const saved = join(root, id);
  const failed = join(root, failedId);
  await mkdir(root);
  try {
    await mkdir(saved);
    await mkdir(failed);
    const pack = "Saved submission fixture";
    await saveVerifiedRun(saved, id, "Phase candidate", 180, pack);
    await writeFile(
      join(failed, "report.json"),
      JSON.stringify({
        id: failedId,
        task: "Earlier candidate",
        status: "failed",
        created_at: "2026-11-04T00:00:00Z",
        error: "Recorded verifier failure",
      }),
    );

    await page.goto("/#model");
    const draft = "# Preserve the working model while reading research.\n";
    const editor = page.getByRole("textbox", {
      name: "Quantum model code editor",
    });
    await editor.fill(draft);
    await page.getByRole("button", { name: "JOBS", exact: true }).click();
    const history = page.getByRole("region", { name: "Research run history" });
    await history
      .getByRole("button", { name: /^Open research run Phase candidate/ })
      .click();
    const detail = page.getByRole("region", {
      name: "Research run",
      exact: true,
    });
    const table = detail.getByRole("table", {
      name: "Recorded verification metrics",
    });
    await expect(
      table.getByRole("cell", { name: "180", exact: true }),
    ).toBeVisible();
    await expect(detail).toContainText("10.0000% lower");
    const download = page.waitForEvent("download");
    await detail.getByRole("link", { name: "Submission package" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe("submission.zip");
    expect(await readFile(await file.path(), "utf8")).toBe(pack);
    await detail.getByText("Archived evidence", { exact: true }).click();
    await expect(detail.locator("pre")).toContainText("verified_shots");

    await page.reload();
    await expect(table).toBeVisible();
    await page
      .getByRole("combobox", { name: "Filter jobs by status" })
      .selectOption("failed");
    await expect(
      history.getByRole("button", {
        name: /^Open research run Phase candidate/,
      }),
    ).toHaveCount(0);
    await history
      .getByRole("button", { name: /^Open research run Earlier candidate/ })
      .click();
    await expect(detail.getByRole("alert")).toContainText(
      "Recorded verifier failure",
    );
    await expect(
      detail.getByRole("link", { name: "Submission package" }),
    ).toHaveCount(0);
    await detail.getByRole("button", { name: "Back to jobs" }).click();
    await expect(detail).toHaveCount(0);
    await page.getByRole("button", { name: "MODEL", exact: true }).click();
    await expect(editor).toHaveValue(draft);
    expect(await jobIds()).toEqual(jobsBefore);
  } finally {
    await rm(root, { recursive: true });
  }
});

test("Jobs confirms baseline decisions, resolves stale windows, and preserves a rollback", async ({
  page,
  browser,
  baseURL,
}) => {
  const { cwd } = await (await page.request.get("/api/agent")).json();
  expect(basename(cwd)).toMatch(/^flagqai-ui-test-/);
  const root = join(cwd, "invsqrt");
  const ids = [randomUUID(), randomUUID()].map((id) => id.replaceAll("-", ""));
  await mkdir(root);
  const otherContext = await browser.newContext({ baseURL });
  const other = await otherContext.newPage();
  try {
    for (const [index, id] of ids.entries()) {
      const path = join(root, id);
      await mkdir(path);
      await saveVerifiedRun(
        path,
        id,
        `Verified candidate ${index + 1}`,
        190 - index,
      );
    }

    await page.goto("/#model");
    const draft = "# Keep this working model while reviewing baselines.\n";
    const editor = page.getByRole("textbox", {
      name: "Quantum model code editor",
    });
    await editor.fill(draft);
    await page.getByRole("button", { name: "JOBS", exact: true }).click();
    await other.goto("/#jobs");
    const open = async (tab, index) =>
      tab
        .getByRole("button", {
          name: new RegExp(`^Open research run Verified candidate ${index}`),
        })
        .click();
    const baseline = (tab) =>
      tab.getByRole("region", { name: "Project baseline", exact: true });
    const adopt = (tab) =>
      baseline(tab).getByRole("button", { name: "Adopt verified candidate" });
    const dialog = (tab) =>
      tab.getByRole("dialog", { name: "Adopt project baseline" });
    const confirm = (tab) =>
      dialog(tab).getByRole("button", { name: "Confirm adopt" });
    await open(page, 1);
    await open(other, 2);
    await expect(baseline(other)).toContainText("revision 0");
    await adopt(page).click();
    await expect(dialog(page)).toContainText("Current revision 0");
    const requestIds = [];
    await page.route("**/baseline", async (route) => {
      requestIds.push(route.request().postDataJSON().request_id);
      const response = await route.fetch();
      if (requestIds.length === 1) await route.abort("failed");
      else await route.fulfill({ response });
    });
    await confirm(page).click();
    await expect(dialog(page).getByRole("alert")).toBeVisible();
    await confirm(page).click();
    await expect(baseline(page)).toContainText(
      "This version is the current baseline.",
    );
    expect(requestIds).toHaveLength(2);
    expect(new Set(requestIds).size).toBe(1);
    await page.unroute("**/baseline");

    await adopt(other).click();
    await confirm(other).click();
    await expect(dialog(other).getByRole("alert")).toContainText(
      "changed in another window",
    );
    await dialog(other)
      .getByRole("button", { name: "Reload baseline" })
      .click();
    await expect(baseline(other)).toContainText("revision 1");
    await adopt(other).click();
    await confirm(other).click();
    await expect(baseline(other)).toContainText("revision 2");

    await page.reload();
    await expect(baseline(page)).toContainText("revision 2");
    await expect(
      page.getByLabel("Current baseline comparison", { exact: true }),
    ).toContainText("+1");
    await baseline(page)
      .getByRole("button", { name: "Restore this version" })
      .click();
    await page
      .getByRole("dialog", { name: "Restore project baseline" })
      .getByRole("button", { name: "Confirm restore" })
      .click();
    await expect(baseline(page)).toContainText(
      "This version is the current baseline.",
    );
    await baseline(page)
      .getByText("Baseline history · 3 decisions", { exact: true })
      .click();
    await expect(baseline(page).getByRole("listitem").first()).toContainText(
      "r3 · Restored",
    );
    await page.getByRole("button", { name: "MODEL", exact: true }).click();
    await expect(editor).toHaveValue(draft);
  } finally {
    await otherContext.close();
    await rm(root, { recursive: true });
  }
});

test("a failed research candidate can be revised after refresh and a lost receipt", async ({
  page,
}) => {
  const { cwd } = await (await page.request.get("/api/agent")).json();
  expect(basename(cwd)).toMatch(/^flagqai-ui-test-/);
  const root = join(cwd, "invsqrt");
  const [parent, failure] = [randomUUID(), randomUUID()].map((id) =>
    id.replaceAll("-", ""),
  );
  await mkdir(root);
  try {
    const parentPath = join(root, parent),
      failurePath = join(root, failure);
    await mkdir(parentPath);
    await mkdir(failurePath);
    await saveVerifiedRun(parentPath, parent, "Passing baseline", 180);
    const source = "Z q0\n";
    await writeFile(join(failurePath, "candidate.kmx"), source);
    const earlier = JSON.stringify({
      id: failure,
      status: "failed",
      created_at: "2026-11-06T00:00:00Z",
      error: "Recorded verifier failure",
      proposal: { parent: "invsqrt-" + parent, source_sha256: sha256(source) },
    });
    await writeFile(join(failurePath, "report.json"), earlier);

    await page.goto("/#model");
    const model = page.getByRole("textbox", {
      name: "Quantum model code editor",
    });
    const draft = "# Independent model draft\n";
    await model.fill(draft);
    await page.getByRole("button", { name: "JOBS", exact: true }).click();
    await page
      .getByRole("button", {
        name: /^Open research run Reviewed candidate iteration/,
      })
      .click();
    const report = page.getByRole("region", {
      name: "Research run",
      exact: true,
    });
    await report
      .getByText("Continue with a new revision", { exact: true })
      .click();
    const replace = report.getByRole("textbox", {
      name: "Text to replace",
      exact: true,
    });
    const replacement = report.getByRole("textbox", {
      name: "Replacement",
      exact: true,
    });
    const reason = report.getByRole("textbox", { name: "Reason", exact: true });
    await replace.fill("Z q0");
    await replacement.fill("X q0");
    await reason.fill("Review the gate correction.");
    await page.reload();
    await expect(reason).toBeVisible();
    await expect(reason).toHaveValue("Review the gate correction.");
    const requests = [];
    await page.route("**/revision", async (route) => {
      requests.push(route.request().postDataJSON());
      const response = await route.fetch();
      if (requests.length === 1) await route.abort("failed");
      else await route.fulfill({ response });
    });
    const stage = report.getByRole("button", {
      name: "Stage revision",
      exact: true,
    });
    await stage.click();
    await expect(
      report.getByRole("alert").filter({ hasText: "Failed to fetch" }),
    ).toBeVisible();
    await page.reload();
    await expect(replace).toHaveValue("Z q0");
    await expect(replacement).toHaveValue("X q0");
    await stage.click();
    await expect(report).toContainText("Candidate revision awaiting review");
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
    await report.getByText("Candidate changes", { exact: true }).click();
    await expect(report.locator("pre")).toContainText("-Z q0");
    await expect(report.locator("pre")).toContainText("+X q0");
    await page
      .getByRole("combobox", { name: "Filter jobs by status" })
      .selectOption("review");
    await expect(
      page.getByRole("button", {
        name: /^Open research run Candidate revision/,
      }),
    ).toHaveCount(1);
    await report.getByRole("button", { name: "Open parent run" }).click();
    await expect(report.getByRole("alert")).toContainText(
      "Recorded verifier failure",
    );
    expect(await readFile(join(failurePath, "report.json"), "utf8")).toBe(
      earlier,
    );
    await page.getByRole("button", { name: "MODEL", exact: true }).click();
    await expect(model).toHaveValue(draft);
  } finally {
    await rm(root, { recursive: true });
  }
});

test("candidate review requires confirmation and follows verification after reload", async ({
  page,
}) => {
  const { cwd } = await (await page.request.get("/api/agent")).json();
  expect(basename(cwd)).toMatch(/^flagqai-ui-test-/);
  const root = join(cwd, "invsqrt");
  const identity = randomUUID().replaceAll("-", "");
  const item = "/api/research-runs/invsqrt-" + identity;
  await mkdir(root);
  try {
    const parent = join(root, identity);
    await mkdir(parent);
    await saveVerifiedRun(parent, identity, "Verified review baseline", 180);
    const source = await readFile(join(parent, "candidate.kmx"));
    const stage = async (request_id) => {
      const response = await page.request.post(item + "/revision", {
        data: {
          request_id,
          parent_sha256: sha256(source),
          expected_project_revision: 0,
          before: "X q0",
          after: "Z q0",
          reason: "Compare a new gate",
        },
      });
      expect(response.ok()).toBe(true);
      return (await response.json()).research_run.id;
    };
    const first = await stage("browser-verify"),
      second = await stage("browser-reject");
    const open = async (id) =>
      page
        .getByRole("button", {
          name: new RegExp(
            `^Open research run Candidate revision.*${id.slice(-8)}$`,
          ),
        })
        .click();
    const detail = page.getByRole("region", {
      name: "Research run",
      exact: true,
    });
    const review = (name) =>
      detail
        .getByRole("region", { name: "Candidate review" })
        .getByRole("button", { name, exact: true });
    const confirm = (title, name) =>
      page
        .getByRole("dialog", { name: title, exact: true })
        .getByRole("button", { name, exact: true });

    await page.goto("/#jobs");
    await open(first);
    const transitions = [];
    const path = join(root, first.replace("invsqrt-", ""), "report.json");
    const staged = JSON.parse(await readFile(path, "utf8"));
    await page.route("**/decision", async (route) => {
      const decision = route.request().postDataJSON();
      if (decision.decision === "reject") {
        await route.continue();
        return;
      }
      transitions.push(decision);
      if (transitions.length === 1) {
        await route.abort("failed");
        return;
      }
      await writeFile(path, JSON.stringify({ ...staged, status: "running" }));
      const response = await page.request.get("/api/research-runs/" + first);
      await route.fulfill({ response });
    });

    await review("Verify candidate").click();
    await confirm("Verify candidate", "Cancel").click();
    expect(transitions).toHaveLength(0);
    await review("Verify candidate").click();
    await confirm("Verify candidate", "Start verification").click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
      "Failed to fetch",
    );
    await page.reload();
    await review("Verify candidate").click();
    await confirm("Verify candidate", "Start verification").click();
    await expect(detail.getByRole("status")).toContainText(
      "Verification running locally",
    );
    expect(transitions).toHaveLength(2);
    expect(transitions[0]).toEqual(transitions[1]);
    await page.reload();
    await expect(detail.getByRole("status")).toContainText(
      "Verification running locally",
    );
    await writeFile(
      path,
      JSON.stringify({
        ...staged,
        status: "interrupted",
        error: "Verification was interrupted.",
      }),
    );
    await expect(detail.getByRole("alert")).toContainText(
      "Verification was interrupted.",
    );
    await expect(
      detail.getByText("Continue with a new revision"),
    ).toBeVisible();
    expect(transitions).toHaveLength(2);

    await open(second);
    await review("Reject candidate").click();
    await confirm("Reject candidate", "Confirm rejection").click();
    await expect(detail.getByText("rejected", { exact: true })).toBeVisible();
    await expect(
      detail.getByRole("region", { name: "Candidate review" }),
    ).toHaveCount(0);
    await expect(
      detail.getByText("Continue with a new revision"),
    ).toBeVisible();
  } finally {
    await rm(root, { recursive: true });
  }
});

test("research team traces saved worker evidence without displacing results or drafts", async ({
  page,
}, testInfo) => {
  const environment = await page.request.get("/api/agent");
  const { cwd } = await environment.json();
  expect(basename(cwd)).toMatch(/^flagqai-ui-test-/);
  const root = join(cwd, "invsqrt");
  const id = randomUUID().replaceAll("-", "");
  const saved = join(root, id);
  await mkdir(saved, { recursive: true });
  const jobsBefore = await (await page.request.get("/api/jobs")).json();
  const runsBefore = await (await page.request.get("/api/python/runs")).json();
  const owner = "coordinator-" + id;
  const client = "trace-client-" + id;
  const action = async (operation, input) => {
    const response = await page.request.post("/api/workspace/actions", {
      data: { client, session: owner, operation, ...input },
    });
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const coordinate = (input) => action("research.coordinate", input);
  try {
    await saveVerifiedRun(saved, id, "Worker traceability study", 180);
    expect(
      (
        await page.request.post("/api/workspace/context", {
          data: {
            client,
            session: owner,
            source: "# Test metadata only",
            name: "Trace fixture",
            page: "model",
            dirty: true,
          },
        })
      ).ok(),
    ).toBe(true);
    const source = await action("research.inspect", {
      parent: "invsqrt-" + id,
    });
    await coordinate({
      action: "open",
      constraints: "Preserve the baseline and drafts.",
      request_id: "open",
    });
    const reserve = (task_id, revision) =>
      coordinate({
        action: "reserve",
        task_id,
        task: "Explore " + task_id,
        parent_run_id: source.parent,
        source_sha256: source.source_sha256,
        expected_project_revision: 0,
        expected_constraint_revision: revision,
        request_id: "reserve-" + task_id,
      });
    let state = (await reserve("width", 1)).coordination;
    await coordinate({
      action: "claim",
      task_id: "width",
      request_id: "claim-width",
    });
    await coordinate({
      action: "observe",
      task_id: "width",
      worker_session_id: state.tasks.width.worker_session_id,
      status: "failed",
      detail: "Retained local tool failure",
      native_run_id: "native-run-width",
      request_id: "failed-width",
    });
    await coordinate({
      action: "evidence",
      task_id: "width",
      run_id: source.parent,
      source_sha256: source.source_sha256,
      request_id: "link-width",
    });
    await coordinate({
      action: "constraints",
      constraints: "Prefer lower cost; retain earlier reports.",
      expected_constraint_revision: 1,
      request_id: "revise",
    });
    const reviewed = await page.request.post(
      "/api/research-runs/" + source.parent + "/coordination",
      {
        data: {
          action: "recommend",
          coordinator_session_id: owner,
          expected_constraint_revision: 2,
          request_id: "propose-cost",
          adjustments: [
            {
              task_id: "width",
              task: "Explore cost",
              reason: "Recheck cost under the revised constraints.",
            },
          ],
        },
      },
    );
    expect(reviewed.ok()).toBe(true);
    const proposal = Object.values(
      (await reviewed.json()).coordination.adjustment_plans,
    ).find((plan) => plan.status === "proposed");
    const confirmed = await page.request.post(
      "/api/research-runs/" + source.parent + "/coordination",
      {
        data: {
          action: "confirm_plan",
          coordinator_session_id: owner,
          expected_constraint_revision: 2,
          request_id: "confirm-cost",
          plan_id: proposal.id,
          plan_sha256: proposal.sha256,
        },
      },
    );
    expect(confirmed.ok()).toBe(true);
    state = (await confirmed.json()).coordination;
    const costTask = state.tasks[proposal.changes[0].task_id];
    await coordinate({
      action: "claim",
      task_id: costTask.id,
      request_id: "claim-cost",
    });
    await coordinate({
      action: "observe",
      task_id: costTask.id,
      worker_session_id: costTask.worker_session_id,
      status: "running",
      request_id: "running-cost",
    });

    await page.goto("/#model");
    const editor = page.getByRole("textbox", {
      name: "Quantum model code editor",
    });
    const draft =
      "# Preserve this working draft while reading worker records.\n";
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
    const chatDraft = "Keep this unsent question while tracing worker records.";
    await chat.fill(chatDraft);
    await agent.click();
    await page.getByRole("button", { name: "JOBS", exact: true }).click();
    await page
      .getByRole("region", { name: "Research run history" })
      .getByRole("button", {
        name: /^Open research run Worker traceability study/,
      })
      .click();
    const detail = page.getByRole("region", {
      name: "Research run",
      exact: true,
    });
    const metrics = detail.getByRole("table", {
      name: "Recorded verification metrics",
    });
    const team = detail.locator("details.fq-research-team");
    await expect(metrics).toBeVisible();
    await expect(team).not.toHaveAttribute("open", "");
    await expect(team.locator("section").first()).not.toBeVisible();
    expect(
      await metrics.evaluate(
        (node) =>
          !!(
            node.compareDocumentPosition(
              document.querySelector(".fq-research-team"),
            ) & Node.DOCUMENT_POSITION_FOLLOWING
          ),
      ),
    ).toBe(true);
    const openedSnapshot = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/research-runs/invsqrt-" + id) &&
        response.request().method() === "GET",
    );
    await team.locator(":scope > summary").click();
    const refreshed = await (await openedSnapshot).json();
    expect(
      refreshed.run.coordination.find((link) => link.task.id === costTask.id)
        .task.status,
    ).toBe("running");
    await expect(team).toContainText("Explore cost · v2");
    await expect(team).toContainText("No verification report linked.");
    await expect(team.locator(".fq-research-status").first()).toHaveText(
      "running",
    );
    await coordinate({
      action: "observe",
      task_id: costTask.id,
      worker_session_id: costTask.worker_session_id,
      status: "completed",
      request_id: "completed-cost",
    });
    await expect(team.locator(".fq-research-status").first()).toHaveText(
      "completed",
      { timeout: 10000 },
    );
    await expect(team).toHaveAttribute("open", "");
    await team.getByText("Earlier task versions · 1", { exact: true }).click();
    const earlier = team
      .getByRole("region", { name: "Research task version" })
      .filter({ hasText: "Explore width" });
    await expect(earlier).toContainText(
      "historical evidence under earlier constraints",
    );
    await expect(earlier).toContainText(
      "Code " + source.source_sha256.slice(0, 12),
    );
    await earlier
      .getByText("Task details and history", { exact: true })
      .click();
    await expect(earlier).toContainText("Retained local tool failure");
    await expect(earlier).toContainText("native-run-width");
    await expect(earlier).toContainText(owner);
    await expect(
      metrics.getByRole("cell", { name: "180", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("research-task-traceability.png"),
      fullPage: true,
    });
    await earlier
      .getByRole("button", { name: "View linked verification" })
      .click();
    await expect(metrics).toBeVisible();
    await page.reload();
    await expect(metrics).toBeVisible();
    await expect(team).not.toHaveAttribute("open", "");
    expect(
      (await (await page.request.get("/api/jobs")).json()).map(
        (item) => item.id,
      ),
    ).toEqual(jobsBefore.map((item) => item.id));
    expect(
      (await (await page.request.get("/api/python/runs")).json()).map(
        (item) => item.id,
      ),
    ).toEqual(runsBefore.map((item) => item.id));
    await page.getByRole("button", { name: "MODEL", exact: true }).click();
    await expect(editor).toHaveValue(draft);
    if ((await agent.getAttribute("aria-expanded")) !== "true")
      await agent.click();
    await expect(chat).toHaveValue(chatDraft);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function constraintStudy(page) {
  const { cwd } = await (await page.request.get("/api/agent")).json();
  expect(basename(cwd)).toMatch(/^flagqai-ui-test-/);
  const root = join(cwd, "invsqrt"),
    id = randomUUID().replaceAll("-", "");
  const saved = join(root, id),
    owner = "review-owner-" + id,
    client = "review-client-" + id;
  await mkdir(saved, { recursive: true });
  await saveVerifiedRun(saved, id, "Constraint review study", 180);
  expect(
    (
      await page.request.post("/api/workspace/context", {
        data: {
          client,
          session: owner,
          source: "# Isolated review fixture",
          name: "Review fixture",
          page: "model",
          dirty: true,
        },
      })
    ).ok(),
  ).toBe(true);
  const coordinate = async (input) => {
    const response = await page.request.post("/api/workspace/actions", {
      data: {
        client,
        session: owner,
        operation: "research.coordinate",
        ...input,
      },
    });
    expect(response.ok()).toBe(true);
    return (await response.json()).coordination;
  };
  await coordinate({
    action: "open",
    constraints: "At most 64 qubits; retain the baseline.",
    request_id: "open",
  });
  const hash = sha256(await readFile(join(saved, "candidate.kmx")));
  for (const task_id of ["width", "cost"]) {
    const state = await coordinate({
      action: "reserve",
      task_id,
      task: "Explore " + task_id,
      expected_constraint_revision: 1,
      expected_project_revision: 0,
      parent_run_id: "invsqrt-" + id,
      source_sha256: hash,
      request_id: "reserve-" + task_id,
    });
    await coordinate({
      action: "claim",
      task_id,
      request_id: "claim-" + task_id,
    });
    await coordinate({
      action: "observe",
      task_id,
      worker_session_id: state.tasks[task_id].worker_session_id,
      status: task_id === "width" ? "failed" : "completed",
      detail: "Retained pre-review outcome",
      request_id: "end-" + task_id,
    });
  }
  await coordinate({
    action: "evidence",
    task_id: "width",
    run_id: "invsqrt-" + id,
    source_sha256: hash,
    request_id: "evidence",
  });
  const path = "/api/research-runs/invsqrt-" + id;
  const open = async (target) => {
    await target.goto("/#jobs");
    const agent = target.getByRole("button", {
      name: "FlagQAI Agent",
      exact: true,
    });
    if ((await agent.getAttribute("aria-expanded")) === "true")
      await agent.click();
    const history = target.getByRole("region", {
      name: "Research run history",
    });
    await history
      .getByRole("button", {
        name: /^Open research run Constraint review study/,
      })
      .click();
    const team = target.locator("details.fq-research-team");
    if (!(await team.evaluate((node) => node.open)))
      await team.locator(":scope > summary").click();
    const review = team.getByRole("region", {
      name: "Research coordination",
      exact: true,
    });
    await review.getByText("Update constraints", { exact: true }).click();
    return {
      team,
      review,
      field: review.getByRole("textbox", {
        name: "Project constraints",
        exact: true,
      }),
    };
  };
  return { root, saved, owner, coordinate, path, open };
}

test("constraint review preserves newer drafts and recovers a lost confirmation receipt without execution", async ({
  page,
}, testInfo) => {
  const study = await constraintStudy(page);
  const editorDraft = "# Preserve this editor draft during constraint review\n";
  const chatDraft = "Keep this unsent question during review.";
  const newer = "A newer unsaved constraint refinement.";
  const reportBefore = await readFile(join(study.saved, "report.json"), "utf8");
  try {
    await page.goto("/#model");
    await page
      .getByRole("textbox", { name: "Quantum model code editor" })
      .fill(editorDraft);
    const agent = page.getByRole("button", {
      name: "FlagQAI Agent",
      exact: true,
    });
    if ((await agent.getAttribute("aria-expanded")) !== "true")
      await agent.click();
    await page
      .getByRole("textbox", { name: "Message FlagQAI", exact: true })
      .fill(chatDraft);
    await agent.click();
    let { team, review, field } = await study.open(page);
    await field.fill("At most 48 qubits; retain earlier reports.");
    let release, applied;
    const gate = new Promise((resolve) => (release = resolve)),
      submitted = new Promise((resolve) => (applied = resolve));
    let confirmations = 0;
    await page.route("**" + study.path + "/coordination", async (route) => {
      const action = route.request().postDataJSON().action;
      if (action === "constraints") {
        const response = await route.fetch();
        applied();
        await gate;
        await route.fulfill({ response });
      } else if (action === "confirm_plan") {
        confirmations++;
        await route.fetch();
        await route.abort("failed");
      } else await route.continue();
    });
    await review
      .getByRole("button", { name: "Review adjustment", exact: true })
      .click();
    await submitted;
    await field.fill(newer);
    release();
    await expect(field).toHaveValue(newer);
    await expect(review).toContainText("Earlier evidence is historical.");
    let state = await study.coordinate({ action: "inspect" });
    expect(Object.keys(state.tasks)).toHaveLength(2);
    const proposal = Object.values(state.adjustment_plans).find(
      (plan) => plan.status === "proposed",
    );
    await expect(review).toContainText("Explore width · v1 → v2");
    await page.screenshot({
      path: testInfo.outputPath("constraint-adjustment-review.png"),
      fullPage: true,
    });
    await review
      .getByRole("button", { name: "Confirm new task versions", exact: true })
      .click();
    await expect(
      review.getByRole("button", {
        name: "Copy continuation request",
        exact: true,
      }),
    ).toBeVisible();
    await expect(review.getByRole("alert")).toHaveCount(0);
    expect(confirmations).toBe(1);
    state = await study.coordinate({ action: "inspect" });
    expect(Object.keys(state.tasks)).toHaveLength(4);
    expect(
      state.history.filter((event) => event.action === "claim"),
    ).toHaveLength(2);
    const approved = proposal.changes.map((change) => change.task_id);
    expect(
      approved.every(
        (id) =>
          state.tasks[id].status === "reserved" &&
          !state.tasks[id].evidence.length,
      ),
    ).toBe(true);
    expect(state.tasks.width.evidence[0].constraints_current).toBe(false);
    await page.reload();
    ({ team, review, field } = await study.open(page));
    await expect(field).toHaveValue(newer);
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    await review
      .getByRole("button", { name: "Copy continuation request", exact: true })
      .click();
    await expect(review).toContainText("Continuation request copied.");
    const continuation = await page.evaluate(() =>
      navigator.clipboard.readText(),
    );
    expect(continuation).toContain(study.owner);
    expect(continuation).toContain(proposal.id);
    for (const id of approved) expect(continuation).toContain(id);
    expect(continuation).not.toContain(newer);
    expect(
      (await study.coordinate({ action: "inspect" })).history.filter(
        (event) => event.action === "claim",
      ),
    ).toHaveLength(2);
    expect(await readFile(join(study.saved, "report.json"), "utf8")).toBe(
      reportBefore,
    );
    await page.getByRole("button", { name: "MODEL", exact: true }).click();
    await expect(
      page.getByRole("textbox", { name: "Quantum model code editor" }),
    ).toHaveValue(editorDraft);
    if ((await agent.getAttribute("aria-expanded")) !== "true")
      await agent.click();
    await expect(
      page.getByRole("textbox", { name: "Message FlagQAI", exact: true }),
    ).toHaveValue(chatDraft);
  } finally {
    await rm(study.root, { recursive: true, force: true });
  }
});

test("constraint review detects stale windows, retains drafts and rejects an obsolete approval", async ({
  page,
}) => {
  const study = await constraintStudy(page);
  let other;
  try {
    const first = await study.open(page);
    const unsaved = "First window constraint draft.";
    await first.field.fill(unsaved);
    other = await page.context().newPage();
    const second = await study.open(other);
    await second.field.fill("Second window limits: 48 qubits.");
    await second.review
      .getByRole("button", { name: "Review adjustment", exact: true })
      .click();
    await expect(
      second.review.getByRole("button", {
        name: "Confirm new task versions",
        exact: true,
      }),
    ).toBeVisible();
    const snapshot = await (await other.request.get(study.path)).json();
    await other.route("**" + study.path, (route) =>
      route.fulfill({ json: snapshot }),
    );
    await first.review
      .getByRole("button", { name: "Review adjustment", exact: true })
      .click();
    await expect(first.review.getByRole("alert")).toContainText(
      "constraints changed",
    );
    await expect(first.field).toHaveValue(unsaved);
    await page.reload();
    await study.open(page);
    await expect(first.field).toHaveValue(unsaved);
    await first.review
      .getByRole("button", { name: "Review against v2", exact: true })
      .click();
    await expect(first.field).toHaveValue(unsaved);
    await first.review
      .getByRole("button", { name: "Review adjustment", exact: true })
      .click();
    await expect(first.review).toContainText(
      "Adjustment for constraints v3 · proposed",
    );
    await first.review
      .getByRole("button", { name: "Reject adjustment", exact: true })
      .click();
    await expect(first.review).toContainText("Adjustment rejected.");
    await other.route("**" + study.path + "/coordination", async (route) => {
      await other.unroute("**" + study.path);
      await route.continue();
    });
    await second.review
      .getByRole("button", { name: "Confirm new task versions", exact: true })
      .click();
    await expect(second.review.getByRole("alert")).toContainText(
      "constraints changed",
    );
    const state = await study.coordinate({ action: "inspect" });
    expect(Object.keys(state.tasks)).toHaveLength(2);
    expect(
      Object.values(state.adjustment_plans)
        .map((plan) => plan.status)
        .sort(),
    ).toEqual(["rejected", "superseded"]);
    expect(state.tasks.width.status).toBe("failed");
    expect(state.tasks.width.evidence).toHaveLength(1);
  } finally {
    await other?.close();
    await rm(study.root, { recursive: true, force: true });
  }
});
