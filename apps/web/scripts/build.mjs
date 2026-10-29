import { build } from "esbuild";
import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
await mkdir(root + "dist/assets", { recursive: true });
await build({
  entryPoints: [root + "src/main.tsx"],
  bundle: true,
  format: "esm",
  outfile: root + "dist/assets/app.mjs",
  target: "es2022",
  minify: true,
  loader: { ".woff2": "file", ".woff": "file", ".ttf": "file" },
  assetNames: "[name]-[hash]",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  legalComments: "eof",
  external: ["/assets/*"],
});
await cp(root + "public", root + "dist", { recursive: true });
await cp(root + "index.html", root + "dist/index.html");
console.log(
  "Built optional React workbench in apps/web/dist. CLI package is unchanged.",
);
