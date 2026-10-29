import { build } from "esbuild";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const bundle = await build({
  stdin: {
    contents:
      'import {gateReference} from "./src/state/gate-reference"; import {flagQuantumExample} from "./src/state/flagquantum-examples"; export const examples=gateReference.map(g=>({name:g.name,qubits:g.qubits,source:flagQuantumExample(g.name,g.qubits,g.parameters)}));',
    resolveDir: root,
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
});
const { examples } = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
);
process.stdout.write(JSON.stringify(examples));
