"""Vendor pinned native notebooks and their Python import closure, never execute them."""
from import_closure import closure
import ast
import base64
import hashlib
import json
from pathlib import Path
import sys

REVISION = 'fb7c05184085f829f282780618014001a3da1714'
root = Path(sys.argv[1])
web = Path(__file__).resolve().parents[2]
base = root / 'examples/synthesis'
out = web / 'public/notebooks'
out.mkdir(parents=True, exist_ok=True)
def sha(raw): return hashlib.sha256(raw).hexdigest()
def encode(value): return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()

def include_inputs(files):
    assets = {}
    for name in list(files):
        source = root / name
        if source.name == '__init__.py': continue
        directories = {source.parent}
        for node in ast.walk(ast.parse(files[name])):
            if (isinstance(node, ast.Subscript) and isinstance(node.value, ast.Attribute)
                    and node.value.attr == 'parents' and '__file__' in ast.unparse(node.value)
                    and isinstance(node.slice, ast.Constant) and type(node.slice.value) is int
                    and 0 <= node.slice.value < len(source.parents)):
                directories.add(source.parents[node.slice.value])
        candidates = []
        for parent in directories:
            if parent != base and base not in parent.parents:
                continue
            candidates.extend(parent.glob('*.json'))
            candidates.extend(parent.glob('*.csv'))
            for directory in ('data', 'historical_ionq'):
                candidates.extend((parent/directory).rglob('*'))
        for asset in candidates:
            if asset.is_file() and not asset.is_symlink() and asset.suffix in ('.json', '.csv', '.npy', '.npz', '.png'):
                assets[asset.relative_to(root).as_posix()] = asset.read_bytes()
    instructions = ['# Pinned data inputs, restored only inside the explicit run directory.',
                    'from pathlib import Path', 'import importlib', '', 'def prepare():']
    hashes = {}
    index = 0
    for name, raw in sorted(assets.items()):
        modules = []
        for offset in range(0, len(raw), 16000):
            module = f'notebook_input_{index:03d}'
            files[module + '.py'] = '# Pinned input bytes.\nimport base64\nDATA = base64.b64decode(' + repr(base64.b64encode(raw[offset:offset+16000]).decode()) + ')\n'
            modules.append(module)
            index += 1
        instructions.extend([f'    target = Path({name!r})', '    target.parent.mkdir(parents=True, exist_ok=True)',
                             f'    target.write_bytes(b"".join(importlib.import_module(name).DATA for name in {modules!r}))'])
        hashes[name] = sha(raw)
    if not assets: instructions.append('    pass')
    files['notebook_inputs.py'] = '\n'.join(instructions) + '\n'
    return hashes

entries = []
for notebook in sorted(base.rglob('walkthrough.ipynb')):
    folder = notebook.parent
    provenance = json.loads((folder/'provenance.json').read_text())
    assert provenance.get('native_notebook') == notebook.relative_to(root).as_posix()
    identity = folder.relative_to(base).as_posix()
    key = sha(identity.encode())[:24]
    raw = notebook.read_bytes()
    (out/(key+'.ipynb')).write_bytes(raw)
    document = json.loads(raw)
    title = next((''.join(c['source']).splitlines()[0].lstrip('# ').strip() for c in document['cells']
                  if c['cell_type']=='markdown' and ''.join(c['source']).startswith('# ')), identity.split('/')[-1].replace('_',' '))
    module = provenance['native_entrypoint']
    entry = root.joinpath(*module.split('.')).with_suffix('.py')
    files, imports = closure(root, entry, (
        ''.join(cell['source']) for cell in document['cells'] if cell['cell_type'] == 'code'
    ))
    input_hashes = include_inputs(files)
    # Keep executable source unchanged. A small launcher establishes package imports.
    files['run_notebook.py'] = (f'# Official FlagQuantum notebook: {identity}\n# SDK source: {REVISION}\n'
        f'# Notebook SHA-256: {sha(raw)}\n' +
        '# Preserve the official entry. Retain only its last successful fq.run result;\n'
        '# this is an observed execution, not a claim about the best optimizer candidate.\n'
        'import runpy\nimport flagquantum as fq\nfrom notebook_inputs import prepare\n\nprepare()\n'
        '_original_run = fq.run\n_last_result = None\n\n'
        'def _record_run(*args, **kwargs):\n'
        '    global _last_result\n'
        '    result = _original_run(*args, **kwargs)\n'
        '    _last_result = result\n'
        '    return result\n\n'
        'fq.run = _record_run\ntry:\n'
        f'    runpy.run_module({module!r}, run_name="__main__")\n'
        'finally:\n    fq.run = _original_run\n\n'
        'if _last_result is not None:\n'
        '    fq.save("last-observed-run.fqx", _last_result.plan, result=_last_result)\n'
        '    print("Saved last observed fq.run execution; see workflow output for scientific conclusions.")\n')
    reason = ''
    if len(files)>64 or sum(len(s.encode()) for s in files.values())>512*1024 or any(len(s.encode())>32768 for s in files.values()):
        reason = 'The companion project exceeds the current bounded project file limits. Download and run it in a local SDK checkout.'
    bundle = {'id':key,'revision':REVISION,'notebookSha256':sha(raw),'entry':'run_notebook.py','files':files,
              'hashes':{p:sha(s.encode()) for p,s in files.items()},'inputHashes':input_hashes,'unavailableReason':reason}
    bundle_raw=encode(bundle);(out/(key+'.json')).write_bytes(bundle_raw)
    entries.append({'id':key,'path':identity,'title':title,'category':identity.split('/')[0],
        'scope':provenance.get('scope','See the official workflow documentation.'),'imports':imports,
        'notebookSha256':sha(raw),'bundleSha256':sha(bundle_raw),'unavailableReason':reason,
        'sourceUrl':f'https://github.com/flagos-ai/FlagQuantum/tree/{REVISION}/examples/synthesis/{identity}'})
assert len(entries)==212
index={'revision':REVISION,'entries':entries}
(web/'src/data/notebook-catalog.json').write_bytes(encode(index))
(out/'catalog.json').write_bytes(encode(index))
for name,path in [('LICENSE',root/'LICENSE'),('CLASSIQ_LICENSE.txt',base/'CLASSIQ_LICENSE.txt')]:
    (out/name).write_bytes(path.read_bytes())
(out/'NOTICE.txt').write_text(f'Native FlagQuantum notebooks and Python sources pinned at {REVISION}.\n'
    'Original provenance, copyrights and licenses are retained. Native workflows derive from the Classiq library; both licenses apply.\n'
    'Notebook bytes and Python sources are unchanged; generated launchers invoke the documented Python entry and save its last observed fq.run result.\n')
print(f'Vendored {len(entries)} notebooks; {sum(not e["unavailableReason"] for e in entries)} bounded companion projects.')

from implementation import generate as generate_implementation
generate_implementation(out)
