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
  await writeFile(
    join(saved, "report.json"),
    JSON.stringify({
      id,
      task,
      status: "completed",
      created_at: "2026-11-05T00:00:00Z",
      scope: "Local verification fixture",
      variants,
      exports: [
        { name: "submission.zip", sha256: sha256(pack) },
        { name: "candidate.kmx", sha256: sha256(source) },
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
