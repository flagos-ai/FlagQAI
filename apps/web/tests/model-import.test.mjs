import test from "node:test";
import assert from "node:assert/strict";
import {
  modelImportKind,
  readModelImport,
  MAX_MODEL_BYTES,
} from "../src/state/model-import.ts";
test("imports classify suffixes case-insensitively and enforce separate source/archive limits", () => {
  assert.equal(modelImportKind({ name: "demo.PY", size: 1 }), "python");
  assert.equal(
    modelImportKind({ name: "demo.QASM", size: MAX_MODEL_BYTES }, true),
    "qasm",
  );
  assert.equal(modelImportKind({ name: "demo.txt", size: 1 }), "qasm");
  assert.equal(
    modelImportKind({ name: "demo.FQX", size: 16 * 1024 * 1024 }),
    "experiment",
  );
  for (const name of ["demo.py", "demo.qasm"])
    assert.throws(
      () => modelImportKind({ name, size: MAX_MODEL_BYTES + 1 }),
      /32 KiB/,
    );
  assert.throws(
    () => modelImportKind({ name: "demo.fqx", size: 16 * 1024 * 1024 + 1 }),
    /16 MiB/,
  );
  assert.throws(
    () => modelImportKind({ name: "demo.py", size: 1 }, true),
    /OpenQASM/,
  );
  for (const name of ["py", "demo.exe", "demo.py.bak"])
    assert.throws(() => modelImportKind({ name, size: 1 }), /Choose/);
  assert.throws(() => modelImportKind({ name: "demo.py", size: 0 }), /empty/);
});
test("UTF-8 source imports preserve code and handle a leading BOM", async () => {
  const source = "# 中文\r\n\nprint('hello')\n";
  assert.deepEqual(await readModelImport(new File([source], "example.PY")), {
    name: "example",
    source,
  });
  assert.deepEqual(
    await readModelImport(new File(["\ufeff" + source], "example.py")),
    { name: "example", source },
  );
});
test("unreadable, non-UTF-8, binary and blank source files return actionable errors", async () => {
  await assert.rejects(
    readModelImport({
      name: "broken.py",
      arrayBuffer: async () => {
        throw Error("NotReadableError");
      },
    }),
    /Select it again/,
  );
  await assert.rejects(
    readModelImport(new File([new Uint8Array([255, 254])], "bad.py")),
    /UTF-8/,
  );
  await assert.rejects(
    readModelImport(new File(["print(0)\0"], "bad.py")),
    /binary file/,
  );
  await assert.rejects(
    readModelImport(new File(["  \n\t"], "blank.py")),
    /No code/,
  );
});
