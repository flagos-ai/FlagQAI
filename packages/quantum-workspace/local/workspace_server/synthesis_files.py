"""Pinned companion files for explicit synthesis-file execution."""
import base64
from hashlib import sha256
import json


def snapshot(web_root, entry, source):
    manifest = json.loads((web_root / 'examples/synthesis-files.json').read_text())
    selected = next((item for item in manifest['entries'] if item['path'] == entry), None)
    if not selected or not entry.endswith('.py'):
        raise ValueError('Choose a Python file from the synthesis source tree.')
    files = {}
    total = 0
    if len(manifest['entries']) > 4094:
        raise ValueError('Synthesis snapshot has too many files.')
    for item in manifest['entries']:
        name = item['path']
        if not isinstance(name, str) or not name or '\\' in name or ':' in name or any(part in ('', '.', '..') for part in name.split('/')):
            raise ValueError('Invalid synthesis snapshot path.')
        url = item['url']
        if not url.startswith(('/examples/synthesis-files/', '/notebooks/')) or '..' in url.split('/'):
            raise ValueError('Invalid synthesis snapshot asset.')
        asset = (web_root / url.lstrip('/')).resolve()
        if not asset.is_relative_to(web_root.resolve()):
            raise ValueError('Synthesis asset escaped its library.')
        total += item['bytes']
        if item['bytes'] < 0 or total > 16 * 1024 * 1024:
            raise ValueError('Invalid synthesis snapshot size.')
        if asset.stat().st_size != item['bytes']:
            raise ValueError('Synthesis source files changed. Rebuild the example library before running.')
        raw = asset.read_bytes()
        if len(raw) != item['bytes'] or sha256(raw).hexdigest() != item['sha256']:
            raise ValueError('Synthesis source files changed. Rebuild the example library before running.')
        files['examples/synthesis/' + name] = base64.b64encode(raw).decode()
    from .synthesis_inputs import inputs
    supplemental = inputs(web_root, entry)
    for item, content in supplemental:
        files[item['path']] = base64.b64encode(content).decode()
    entry = 'examples/synthesis/' + entry
    files[entry] = base64.b64encode(source.encode()).decode()
    # Real package roots prevent an unrelated installed examples package winning.
    files['examples/__init__.py'] = ''
    files.setdefault('examples/synthesis/__init__.py', '')
    payload = {'synthesis_entry': entry, 'synthesis_files': files}
    raw = json.dumps(payload, sort_keys=True).encode()
    return raw, {'path': selected['path'], 'revision': manifest['revision'],
                 'original_sha256': selected['sha256'], 'supplemental_inputs': [item for item, _ in supplemental], 'snapshot_hash': sha256(raw).hexdigest()}
