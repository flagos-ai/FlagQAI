"""Mirror tracked synthesis files byte-for-byte; never execute example code."""
from hashlib import sha256
import json
from pathlib import Path
import subprocess
import sys


def generate(root, web):
    revision = subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip()
    paths = subprocess.check_output(['git', '-C', str(root), 'ls-tree', '-r', '--name-only', '-z', 'HEAD', 'examples/synthesis']).decode().split('\0')
    notebooks = json.loads((web / 'public/notebooks/catalog.json').read_text())
    by_path = {item['path'] + '/walkthrough.ipynb': item for item in notebooks['entries']}
    entries = []
    for path in sorted(filter(None, paths)):
        relative = path.removeprefix('examples/synthesis/')
        raw = (root / path).read_bytes()
        digest = sha256(raw).hexdigest()
        entry = {'path': relative, 'sha256': digest, 'bytes': len(raw)}
        if relative.endswith('.ipynb'):
            item = by_path[relative]
            if digest != item['notebookSha256']:
                raise ValueError(f'Notebook snapshot differs from repository file: {relative}')
            entry.update(url=f'/notebooks/{item["id"]}.ipynb', notebookId=item['id'])
        else:
            target = web / 'public/examples/synthesis-files' / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(raw)
            entry['url'] = '/examples/synthesis-files/' + relative
        entries.append(entry)
    document = {'revision': revision, 'root': 'examples/synthesis', 'entries': entries}
    (web / 'src/data/synthesis-files.json').write_text(json.dumps(document, indent=2) + '\n')
    (web / 'public/examples/synthesis-files.json').write_text(json.dumps(document, indent=2) + '\n')
    print(f'Mirrored {len(entries)} original files at {revision}')


if __name__ == '__main__':
    generate(Path(sys.argv[1]), Path(__file__).resolve().parents[2])
