"""Bounded OpenQASM exchange files; never expose arbitrary workspace paths."""
import hashlib
import os
import re
import stat
import uuid
from contextlib import contextmanager

LIMIT = 32768


@contextmanager
def model_directory(root, create=False):
    directory = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for part in ('.flagqai', 'quantum-workspace', 'models'):
            if create:
                try:
                    os.mkdir(part, mode=0o700, dir_fd=directory)
                except FileExistsError:
                    pass
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=directory)
            os.close(directory)
            directory = child
        yield directory
    finally:
        os.close(directory)


def snapshot(name, content):
    return {'id': name, 'path': '.flagqai/quantum-workspace/models/' + name,
            'source': content.decode('utf-8'), 'revision': hashlib.sha256(content).hexdigest()}


def create_model(root, source, language="qasm"):
    if not isinstance(source, str) or len(source.encode('utf-8')) > LIMIT:
        raise ValueError('Share a source file no larger than 32 KiB.')
    content = source.encode('utf-8')
    if language not in ('qasm','python'): raise ValueError('Unsupported source language.')
    name = uuid.uuid4().hex + ('.py' if language == 'python' else '.qasm')
    with model_directory(root, create=True) as directory:
        fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=directory)
        with os.fdopen(fd, 'wb') as output:
            output.write(content)
    return snapshot(name, content)


def read_model(root, name):
    if not re.fullmatch(r'[a-f0-9]{32}\.(?:qasm|py)', name):
        raise ValueError('Invalid shared model identifier.')
    with model_directory(root) as directory:
        fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory)
        with os.fdopen(fd, 'rb') as source:
            before = os.fstat(source.fileno())
            if not stat.S_ISREG(before.st_mode) or before.st_size > LIMIT:
                raise ValueError('Shared models must be regular UTF-8 files no larger than 32 KiB.')
            content = source.read(LIMIT + 1)
            after = os.fstat(source.fileno())
            if len(content) > LIMIT or (before.st_mtime_ns, before.st_size) != (after.st_mtime_ns, after.st_size):
                raise ValueError('Model is changing; retrying on the next refresh.')
    return snapshot(name, content)
