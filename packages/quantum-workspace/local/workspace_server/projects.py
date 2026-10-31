"""Bounded projects beneath the configured Agent workspace; no arbitrary paths."""
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import stat
import threading

from .job_store import SQLiteJobStore

TEXT_LIMIT = 32768
BUNDLE_LIMIT = 512 * 1024
FILE_LIMIT = 64
IGNORED = {'node_modules', 'vendor', '__pycache__', 'venv', 'dist', 'build', 'site-packages'}


class ProjectConflict(ValueError):
    pass


def parts(path, root=False):
    if root and path == '.': return []
    if not isinstance(path, str) or not path or len(path) > 240 or '\\' in path or ':' in path:
        raise ValueError('Use a project-relative path.')
    values = path.split('/')
    if any(not value or value.startswith('.') or value in IGNORED or any(ord(c) < 32 for c in value) for value in values):
        raise ValueError('Hidden, parent, dependency and empty path components are not allowed.')
    return values


def extension(path):
    return Path(path).suffix.lower()


@contextmanager
def directory(root, values, create=False):
    fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for value in values:
            if create:
                try: os.mkdir(value, 0o700, dir_fd=fd)
                except FileExistsError: pass
            child = os.open(value, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd); fd = child
        yield fd
    finally: os.close(fd)


def read_at(parent, name, limit):
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
    with os.fdopen(fd, 'rb') as stream:
        before = os.fstat(stream.fileno())
        if not stat.S_ISREG(before.st_mode) or before.st_size > limit:
            raise ValueError('Use a bounded regular file (text: 32 KiB; .fqx: 16 MiB).')
        content = stream.read(limit + 1)
        after = os.fstat(stream.fileno())
        if len(content) > limit or (before.st_mtime_ns, before.st_size) != (after.st_mtime_ns, after.st_size):
            raise ProjectConflict('The file is changing. Refresh before continuing.')
    return content


def digest(content): return hashlib.sha256(content).hexdigest()


def manifest_hash(files):
    return digest(json.dumps(sorted((path, digest(source.encode())) for path, source in files.items()), separators=(',', ':')).encode())


class Projects:
    def __init__(self, settings):
        self.root = Path(settings.agent_cwd or settings.web_root.parent).resolve()
        self.store = SQLiteJobStore(settings.database_path.with_suffix('.projects.sqlite3'))
        self.store.initialize()
        self.lock = threading.RLock()
        self.backups = settings.database_path.parent / 'project-file-versions'

    def list(self):
        return {'workspace_root': str(self.root), 'projects': [project for project in self.store.list()
                if project['id'] == digest((str(self.root) + '\0' + project['path']).encode())[:32]]}

    def open(self, path, create=False):
        if isinstance(path, str) and Path(path).is_absolute():
            try: path = str(Path(path).relative_to(self.root))
            except ValueError: raise ValueError('Choose a project inside the configured Agent workspace: ' + str(self.root))
        values = parts(path, root=True)
        with directory(self.root, values, create): pass
        identity = digest((str(self.root) + '\0' + path).encode())[:32]
        project = {'status': 'opened', 'id': identity, 'path': path, 'name': values[-1] if values else self.root.name,
                   'root': str(self.root.joinpath(*values))}
        self.store.put(project)
        return self.tree(identity)

    def get(self, identity):
        if not isinstance(identity, str) or len(identity) != 32 or any(c not in '0123456789abcdef' for c in identity):
            raise ValueError('Invalid project identifier.')
        project = self.store.get(identity)
        if not project: raise FileNotFoundError('Open this project before accessing its files.')
        parts(project['path'], root=True)
        if identity != digest((str(self.root) + '\0' + project['path']).encode())[:32]:
            raise ValueError('This project belongs to a different configured workspace.')
        return project

    @contextmanager
    def parent(self, identity, path, create=False):
        project = self.get(identity)
        values = parts(path)
        if extension(path) not in ('.py', '.qasm', '.fqx'):
            raise ValueError('Project files support .py, .qasm and read-only .fqx archives.')
        with directory(self.root, parts(project['path'], root=True) + values[:-1], create) as fd:
            yield project, fd, values[-1]

    def read(self, identity, path):
        if extension(path) == '.fqx': raise ValueError('Open .fqx files in Quantum; archives are read-only.')
        with self.parent(identity, path) as (project, fd, name):
            content = read_at(fd, name, TEXT_LIMIT)
        return {'id': 'project:' + identity + ':' + path, 'path': path,
                'source': content.decode('utf-8'), 'revision': digest(content),
                'project': {'id': identity, 'path': path},
                'workspace_path': '/'.join(p for p in (project['path'] if project['path'] != '.' else '', path) if p)}

    def write(self, identity, path, source, expected_revision=None):
        if not isinstance(source, str) or len(source.encode()) > TEXT_LIMIT or extension(path) not in ('.py', '.qasm'):
            raise ValueError('Save a .py or .qasm UTF-8 file no larger than 32 KiB.')
        content = source.encode()
        with self.lock, self.parent(identity, path, create=expected_revision is None) as (_, fd, name):
            if expected_revision is None:
                try: target = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=fd)
                except FileExistsError: raise ProjectConflict('The file already exists. Open it before editing.')
                with os.fdopen(target, 'wb') as output: output.write(content)
            else:
                previous = read_at(fd, name, TEXT_LIMIT)
                if digest(previous) != expected_revision:
                    raise ProjectConflict('The disk file changed. Review incoming changes before saving.')
                # Retain every overwritten disk revision as a recoverable local copy.
                self.backups.mkdir(parents=True, exist_ok=True)
                backup = self.backups / (identity + '-' + digest(path.encode()) + '-' + digest(previous))
                if not backup.exists(): backup.write_bytes(previous)
                temporary = '.save-' + os.urandom(16).hex()
                target = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=fd)
                try:
                    with os.fdopen(target, 'wb') as output:
                        output.write(content); output.flush(); os.fsync(output.fileno())
                    if digest(read_at(fd, name, TEXT_LIMIT)) != expected_revision:
                        raise ProjectConflict('The disk file changed during save. Your draft is retained.')
                    os.replace(temporary, name, src_dir_fd=fd, dst_dir_fd=fd)
                finally:
                    try: os.unlink(temporary, dir_fd=fd)
                    except FileNotFoundError: pass
        return self.read(identity, path)

    def tree(self, identity, sources=False):
        project = self.get(identity)
        files, content, errors = [], {}, []
        visited = 0
        truncated = False
        def scan(fd, prefix=''):
            nonlocal visited, truncated
            for name in sorted(os.listdir(fd)):
                if name.startswith('.') or name in IGNORED: continue
                visited += 1
                if visited > 1024 or len(files) >= 128:
                    truncated = True; return
                path = prefix + name
                info = os.stat(name, dir_fd=fd, follow_symlinks=False)
                if stat.S_ISDIR(info.st_mode):
                    try:
                        child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
                        try: scan(child, path + '/')
                        finally: os.close(child)
                    except OSError: errors.append(path + ': unavailable directory')
                elif stat.S_ISREG(info.st_mode) and extension(path) in ('.py', '.qasm', '.fqx'):
                    item = {'path': path, 'size': info.st_size, 'kind': 'artifact' if extension(path) == '.fqx' else 'source'}
                    if item['kind'] == 'source':
                        try:
                            raw = read_at(fd, name, TEXT_LIMIT)
                            content[path] = raw.decode('utf-8'); item['revision'] = digest(raw)
                        except (ValueError, OSError) as error: errors.append(path + ': ' + str(error))
                    files.append(item)
        with directory(self.root, parts(project['path'], root=True)) as fd: scan(fd)
        result = {**project, 'files': files, 'snapshot_hash': manifest_hash(content), 'truncated': truncated, 'errors': errors}
        if sources: result['sources'] = content
        return result

    def snapshot(self, identity, entry, source=None, expected_revision=None, expected_hash=None):
        parts(entry)
        if extension(entry) != '.py': raise ValueError('Choose a Python entry file.')
        tree = self.tree(identity, sources=True)
        files = tree.pop('sources')
        if tree['truncated'] or tree['errors'] or len(files) > FILE_LIMIT or sum(len(s.encode()) for s in files.values()) > BUNDLE_LIMIT:
            raise ValueError('Use a smaller project: at most 64 readable source files and 512 KiB of text.')
        if entry not in files: raise FileNotFoundError('Python entry file not found.')
        if expected_revision is not None and digest(files[entry].encode()) != expected_revision:
            raise ProjectConflict('The entry file changed on disk. Review incoming changes before running.')
        if expected_hash is not None and tree['snapshot_hash'] != expected_hash:
            raise ProjectConflict('Project inputs changed. Inspect the project again before running.')
        disk_hash = tree['snapshot_hash']
        if source is not None:
            if not isinstance(source, str) or len(source.encode()) > TEXT_LIMIT: raise ValueError('Entry draft exceeds 32 KiB.')
            files[entry] = source
        if sum(len(text.encode()) for text in files.values()) > BUNDLE_LIMIT: raise ValueError('Project input snapshot exceeds 512 KiB.')
        return {'files': files, 'entry': entry, 'project': {
            'id': identity, 'name': tree['name'], 'path': tree['path'], 'entry': entry,
            'disk_hash': disk_hash, 'snapshot_hash': manifest_hash(files),
            'files': [{'path': path, 'sha256': digest(text.encode())} for path, text in sorted(files.items())]}}

    def artifact(self, identity, path, experiments):
        if extension(path) != '.fqx': raise ValueError('Select a .fqx archive.')
        with self.parent(identity, path) as (_, fd, name): content = read_at(fd, name, 16 * 1024 * 1024)
        return experiments.import_file(content, name)
