import { copyFile, cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SCIENTIFIC_RUNTIME_FILES } from "./scientific-runtime-files.mjs";

const cliRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = join(cliRoot, "..", "..");
const targetRoot = join(cliRoot, "lib", "flagqai-platform");

await rm(targetRoot, { recursive: true, force: true });
await mkdir(targetRoot, { recursive: true });
await cp(join(repositoryRoot, "packages", "harness-adapter"), join(targetRoot, "harness-adapter"), {
  recursive: true,
  filter: (source) => !source.endsWith("package.json") && !source.endsWith("README.md"),
});
await cp(join(repositoryRoot, "packages", "protocol"), join(targetRoot, "protocol"), {
  recursive: true,
  filter: (source) => !source.endsWith("package.json") && !source.endsWith("README.md"),
});
await cp(join(repositoryRoot, "packages", "server"), join(targetRoot, "server"), {
  recursive: true,
  filter: (source) => !source.endsWith("package.json") && !source.endsWith("README.md") && !source.includes(`${join("server", "bin")}`),
});
await cp(join(repositoryRoot, "packages", "sdk"), join(targetRoot, "sdk"), {
  recursive: true,
  filter: (source) => !source.endsWith("package.json") && !source.endsWith("README.md") && !source.endsWith("index.d.ts"),
});
await cp(join(repositoryRoot, "packages", "ui-core"), join(targetRoot, "ui-core"), {
  recursive: true,
  filter: (source) => !source.endsWith("package.json") && !source.endsWith("README.md") && (!source.endsWith(".mts") || source.endsWith(".d.mts")),
});

// Server preparation adapters use the canonical bounded process executor.
for (const file of SCIENTIFIC_RUNTIME_FILES) {
  const target = join(targetRoot, "scientific-core", file);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(join(repositoryRoot, "packages", "scientific-core", file), target);
}
