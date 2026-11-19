"""Copy a pinned official workflow without executing code or overwriting user files."""
import json
import re
from .projects import BUNDLE_LIMIT, FILE_LIMIT, TEXT_LIMIT, ProjectConflict, digest, directory, parts, read_at


def notebook_bundle(web_root, identity):
    if not isinstance(identity, str) or not re.fullmatch(r'[a-f0-9]{24}', identity):
        raise ValueError('Select a catalog notebook.')
    catalog = json.loads((web_root / 'notebooks/catalog.json').read_text())
    item = next((item for item in catalog['entries'] if item['id'] == identity), None)
    if not item: raise ValueError('Notebook is not in the pinned catalog.')
    raw = (web_root / 'notebooks' / (identity + '.json')).read_bytes()
    if digest(raw) != item['bundleSha256']: raise ValueError('Notebook project source checksum changed.')
    bundle = json.loads(raw)
    if bundle['revision'] != catalog['revision'] or bundle['id'] != identity:
        raise ValueError('Notebook source revision changed.')
    if bundle['unavailableReason']: raise ValueError(bundle['unavailableReason'])
    files = bundle['files']
    if not isinstance(files, dict) or len(files) > FILE_LIMIT or sum(len(s.encode()) for s in files.values()) > BUNDLE_LIMIT:
        raise ValueError('Notebook exceeds bounded project limits.')
    for path, source in files.items():
        parts(path)
        if not path.endswith('.py') or len(source.encode()) > TEXT_LIMIT or digest(source.encode()) != bundle['hashes'].get(path):
            raise ValueError('Notebook contains invalid or changed source.')
    if bundle['entry'] not in files: raise ValueError('Notebook entry is missing.')
    notebook = (web_root / 'notebooks' / (identity + '.ipynb')).read_bytes()
    if digest(notebook) != item['notebookSha256']: raise ValueError('Notebook checksum changed.')
    return catalog, item, bundle, notebook


def create_notebook_project(projects, web_root, identity, request_id):
    if not isinstance(request_id, str) or not re.fullmatch(r'[a-f0-9]{32}', request_id):
        raise ValueError('A notebook copy request identity is required.')
    catalog, item, bundle, notebook = notebook_bundle(web_root, identity)
    files = bundle['files']
    # Stable request identity makes a lost response retry the same project.
    # Existing files must remain identical: never replace an edited research copy.
    slug = '-'.join(item['path'].split('/')[-2:]).replace('_', '-')
    path = 'notebook-copies/' + slug[:60] + '-' + request_id
    with projects.lock:
        project = projects.open(path, create=True)
        project['name'] = item['title'] + ' · copy'
        projects.store.put({key: project[key] for key in ('status', 'id', 'path', 'name', 'root')})
        for name, source in files.items():
            try: saved = projects.read(project['id'], name)
            except FileNotFoundError: projects.write(project['id'], name, source)
            else:
                if saved['source'] != source: raise ProjectConflict('This notebook copy was edited. Open it from Projects or create a new copy.')
        with directory(projects.root, parts(path)) as fd:
            for name, content in [('walkthrough.ipynb', notebook),
                    ('LICENSE', (web_root/'notebooks/LICENSE').read_bytes()),
                    ('CLASSIQ_LICENSE.txt', (web_root/'notebooks/CLASSIQ_LICENSE.txt').read_bytes()), ('SOURCE.json', json.dumps({
                    'revision':catalog['revision'], 'source':item['sourceUrl'],
                    'notebook_sha256':item['notebookSha256'], 'files':bundle['hashes'],
                    'inputs':bundle['inputHashes']}, indent=2).encode())]:
                try: prior = read_at(fd, name, 512 * 1024)
                except FileNotFoundError:
                    import os
                    target = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=fd)
                    with os.fdopen(target, 'wb') as stream: stream.write(content)
                else:
                    if prior != content: raise ProjectConflict('Notebook provenance was edited; create a new copy.')
        return {'project':projects.tree(project['id']), 'file':projects.read(project['id'], bundle['entry'])}
