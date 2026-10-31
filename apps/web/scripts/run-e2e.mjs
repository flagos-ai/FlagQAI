// Isolated CI browser acceptance: no provider credentials or model requests.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const control = await mkdtemp(join(tmpdir(), "flagqai-e2e-control-"));
const reservations = [];
for (let i = 0; i < 3; i++) {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  reservations.push(server);
}
const ports = reservations.map((server) => server.address().port);
await Promise.all(
  reservations.map((server) => new Promise((resolve) => server.close(resolve))),
);
const child = spawn(
  process.execPath,
  [
    fileURLToPath(import.meta.resolve("@playwright/test/cli")),
    "test",
    ...process.argv.slice(2),
  ],
  {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      FQ_E2E_CONTROL_DIR: control,
      FQ_TEST_PORT: String(ports[0]),
      FQ_TEST_AGENT_PORT: String(ports[1]),
      FQ_TEST_PROXY_PORT: String(ports[2]),
    },
  },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => child.kill(signal));
const code = await new Promise((resolve) =>
  child.once("exit", (code) => resolve(code ?? 1)),
);
await rm(control, { recursive: true, force: true });
process.exitCode = code;
