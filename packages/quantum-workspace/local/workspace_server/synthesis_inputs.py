"""Verified, separately attributed inputs for explicit example execution."""
from hashlib import sha256
import json
from pathlib import PurePosixPath


def inputs(web_root, source_path):
    manifest = web_root / 'examples/synthesis-inputs/manifest.json'
    if not manifest.is_file():
        return []
    result = []
    for item in json.loads(manifest.read_text())['entries']:
        if not source_path.startswith(item['prefix']):
            continue
        name = item['path']
        if (not isinstance(name, str) or '\\' in name or ':' in name
                or any(part in ('', '.', '..') or part.startswith('.') for part in name.split('/'))
                or PurePosixPath(name).suffix not in ('.csv', '.json', '.npy', '.npz', '.pth')):
            raise ValueError('Invalid supplemental example input path.')
        asset = (web_root / item['url'].lstrip('/')).resolve()
        if not asset.is_relative_to((web_root / 'examples/synthesis-inputs').resolve()):
            raise ValueError('Supplemental input escaped its asset directory.')
        if not 0 < item['bytes'] <= 4 * 1024 * 1024 or asset.stat().st_size != item['bytes']:
            raise ValueError('Supplemental example input size changed.')
        raw = asset.read_bytes()
        if sha256(raw).hexdigest() != item['sha256']:
            raise ValueError('Supplemental example input checksum changed.')
        result.append((item, raw))
    return result


def prepare(web_root, source_path, root):
    for item, raw in inputs(web_root, source_path):
        target = root / item['path']
        if target.exists():
            # A user's own input is authoritative; never overwrite it.
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        try:
            with target.open('xb') as stream:
                stream.write(raw)
        except FileExistsError:
            pass
