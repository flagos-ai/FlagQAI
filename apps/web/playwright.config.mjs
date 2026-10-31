import { defineConfig } from "@playwright/test";
if (!process.env.FQ_E2E_CONTROL_DIR)
  throw Error("Use npm run test:e2e for an isolated acceptance workspace.");
const port = Number(process.env.FQ_TEST_PORT);
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  maxFailures: process.env.CI ? 1 : 0,
  timeout: 120000,
  expect: { timeout: 30000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  outputDir: "test-results",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: "chromium",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node scripts/agent-protocol-fixture.mjs",
    url: `http://127.0.0.1:${port}/api/python/environment`,
    timeout: 60000,
    reuseExistingServer: false,
    env: {
      FQ_TEST_REPAIR: "1",
      FQ_TEST_CONTROL: "1",
      FQ_TEST_RECOVERY: "1",
      FQ_COMPUTE_TRANSPORT: "local",
      FQ_LOCAL_PYTHON: process.env.FQ_LOCAL_PYTHON || "python3",
      FQ_EXPERIMENT_PYTHON: process.env.FQ_LOCAL_PYTHON || "python3",
    },
  },
});
