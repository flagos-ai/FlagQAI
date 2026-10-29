"""Web history visibility preferences only. Native transcripts are never copied or deleted."""
from contextlib import contextmanager
import json
import os
import threading
import uuid

_LOCK = threading.Lock()
_FILE = 'history-trash.json'

@contextmanager
def directory(root):
    fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for part in ('.flagqai', 'quantum-workspace'):
            try: os.mkdir(part, mode=0o700, dir_fd=fd)
            except FileExistsError: pass
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd); fd = child
        yield fd
    finally: os.close(fd)

def read(fd):
    try: handle = os.open(_FILE, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
    except FileNotFoundError: return []
    with os.fdopen(handle, 'rb') as source:
        raw = source.read(1024 * 1024 + 1)
    if len(raw) > 1024 * 1024: raise ValueError('History preferences exceed the supported limit.')
    value = json.loads(raw)
    if not isinstance(value, list) or any(not isinstance(row, dict) or not isinstance(row.get('backendId'), str) or not isinstance(row.get('sessionId'), str) for row in value):
        raise ValueError('Invalid history preferences. The native history is unchanged.')
    return value

def history_trash(root, backend=None, session=None, trashed=None):
    with _LOCK, directory(root) as fd:
        rows = read(fd)
        if trashed is None: return rows
        rows = [row for row in rows if (row['backendId'], row['sessionId']) != (backend, session)]
        if trashed: rows.append({'backendId': backend, 'sessionId': session})
        if len(rows) > 5000: raise ValueError('Trash is full. Restore some conversations before adding more.')
        temporary = '.history-trash-' + uuid.uuid4().hex
        target = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=fd)
        try:
            with os.fdopen(target, 'w') as output: json.dump(rows, output); output.flush(); os.fsync(output.fileno())
            os.replace(temporary, _FILE, src_dir_fd=fd, dst_dir_fd=fd)
        finally:
            try: os.unlink(temporary, dir_fd=fd)
            except FileNotFoundError: pass
        return rows
