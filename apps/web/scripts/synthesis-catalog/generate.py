"""Generate the checked-in catalog from an extracted, pinned official SDK tree."""
import ast
import hashlib
import json
from pathlib import Path
import re
import sys

REVISION = "b3fa4a78935777bb8e3853752192e9cd47972b2f"
root = Path(sys.argv[1])
web = Path(__file__).resolve().parents[2]
base = root / "examples/synthesis"
selection = {item["path"]: item for item in json.loads(Path(__file__).with_name("selection.json").read_text())}
entries = []
category = None
workflow = False
workflows = set()
for line in (base / "CATALOG.md").read_text().splitlines():
    match = re.match(r"## (\w+) \((\d+) native programs\)", line)
    if match:
        category = match[1]
        workflow = False
    if line.startswith("Validated local Notebook workflows:"):
        workflow = True
    match = re.match(r"- \[([^]]+)\]\(([^)]+)/README.md\)", line)
    if not match or not category:
        continue
    name, path = match.groups()
    if workflow:
        workflows.add(path)
        continue
    item = {"id": path, "category": category, "name": name.replace("_", " "),
            "path": path, "readme": f"https://github.com/flagos-ai/FlagQuantum/blob/{REVISION}/examples/synthesis/{path}/README.md"}
    if path in selection:
        selected = selection[path]
        original = (base / path / "main.py").read_text()
        tree = ast.parse(original)
        required = sorted({alias.name for node in tree.body if isinstance(node, ast.ImportFrom)
                           and node.module == 'flagquantum.synth' for alias in node.names})
        # Only replace the script entry point. Definitions and imports stay upstream-native.
        guard = next(node for node in tree.body if isinstance(node, ast.If) and ast.unparse(node.test) == "__name__ == '__main__'")
        source = "\n".join(original.splitlines()[:guard.lineno - 1]).rstrip()
        filename = path.split("/")[-1] + ".fqx"
        registers = repr(tuple(selected["registers"]))
        source = (f"# Official FlagQuantum example: {path}\n# Source revision: {REVISION}\n"
                  "# Workbench copy: original definitions; explicit run, resources and FQX save below.\n"
                  f"# {selected['purpose']}\n\n" + source +
                  f'\n\n# Run explicitly; no Agent or paid model is required.\nprogram = {selected["build"]}\n'
                  f'result = fq.run(program)\nprint(dict(program.probabilities(result, registers={registers})))\n'
                  'print("Resources:", program.report["resources"])\n'
                  f'fq.save("{filename}", result.plan, result=result)\n')
        ast.parse(source)
        item.update(title=selected["title"], purpose=selected["purpose"], source=source,
                    requiredCapabilities=required,
                    sourceSha256=hashlib.sha256(source.encode()).hexdigest(),
                    upstreamSha256=hashlib.sha256(original.encode()).hexdigest(),
                    filename=filename,
                    comparison="examples.synthesis." + path.replace("/", ".") + ".comparisons.circuit")
    entries.append(item)
assert len(entries) == 216 and len({item['id'] for item in entries}) == 216
assert len([item for item in entries if 'source' in item]) == len(selection)
for item in entries:
    item["upstreamWorkflowValidated"] = item['id'] in workflows
out = web / "src/data/synthesis-catalog.json"
out.write_text(json.dumps({"revision": REVISION, "entries": entries}, indent=2) + "\n")
licenses = web / "public/licenses/flagquantum-examples"
licenses.mkdir(parents=True, exist_ok=True)
for name, path in [("LICENSE", root / "LICENSE"), ("CLASSIQ_LICENSE.txt", base / "CLASSIQ_LICENSE.txt")]:
    (licenses / name).write_bytes(path.read_bytes())
(licenses / "NOTICE.txt").write_text(f"Native examples from flagos-ai/FlagQuantum at {REVISION}.\nAdapted script entry points save FQX artifacts; definitions retain their source identity.\nUpstream migration derives examples from the Classiq library; retain both included licenses.\nSee each pinned README for provenance and independent comparison commands.\n")
print(f"Generated {len(entries)} catalog entries and {len(selection)} editable copies.")
