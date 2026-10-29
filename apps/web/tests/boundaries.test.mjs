import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
const root = path.resolve(import.meta.dirname, "..");
test("React views contain no backend transport, legacy global renderer or second Agent loop", () => {
  for (const folder of ["components", "pages"])
    for (const file of readdirSync(path.join(root, "src", folder))) {
      const source = readFileSync(path.join(root, "src", folder, file), "utf8");
      if (file !== "AgentMath.tsx")
        assert.doesNotMatch(source, /dangerouslySetInnerHTML/, file);
      else {
        assert.match(source, /trust: false/);
        assert.match(source, /renderToString\(tex/);
      }
      assert.doesNotMatch(
        source,
        /\bfetch\s*\(|\binnerHTML|window\.state|eval\(/,
        file,
      );
    }
  const api = readFileSync(path.join(root, "src/api/harness.ts"), "utf8");
  assert.match(api, /packages\/sdk\/index.mjs/);
});
test("Web is separately built and cannot enter the native CLI tarball implicitly", () => {
  const manifest = JSON.parse(
    readFileSync(path.join(root, "../cli/package.json"), "utf8"),
  );
  assert(!("react-dom" in manifest.dependencies));
  assert.doesNotMatch(
    JSON.stringify(manifest.files),
    /apps\/web|quantum-workspace/,
  );
});
