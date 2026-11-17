import { test, expect } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

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
    const variants = await Promise.all(
      [
        ["baseline", 200],
        ["candidate", 180],
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
    const pack = "Saved submission fixture";
    await writeFile(join(saved, "submission.zip"), pack);
    await writeFile(
      join(saved, "report.json"),
      JSON.stringify({
        id,
        title: "Phase candidate",
        task: "Phase candidate",
        status: "completed",
        created_at: "2026-11-05T00:00:00Z",
        scope: "Local verification fixture",
        variants,
        exports: [{ name: "submission.zip", sha256: sha256(pack) }],
      }),
    );
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
