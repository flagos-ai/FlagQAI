"""Bounded binary transport for artifacts from one Python task directory."""
import base64
import hashlib
from pathlib import PurePosixPath
import re

from .python_worker import FQX_LIMITS


class ExperimentTransfer:
    def __init__(self, root):
        self.root = root
        self.current = None
        self.indices = set()
        self.total = 0
        self.completed = []

    def discard(self, name=None):
        if self.current and (name is None or self.current['name'] == name):
            self.current['path'].unlink(missing_ok=True)
            self.current = None

    def accept(self, event):
        index = event.get('index')
        if type(index) is not int or not 1 <= index <= FQX_LIMITS['files']:
            raise ValueError('Invalid experiment transfer index.')
        if event['type'] == 'fqx-start':
            name, size = event.get('name'), event.get('size')
            if self.current or index in self.indices:
                raise ValueError('Duplicate or overlapping experiment transfer.')
            if not isinstance(name, str) or len(name) > 256 or '\\' in name or '\x00' in name or PurePosixPath(name).is_absolute() or '..' in PurePosixPath(name).parts or not name.lower().endswith('.fqx'):
                raise ValueError('Invalid experiment path.')
            if type(size) is not int or not 0 < size <= FQX_LIMITS['file_bytes'] or self.total + size > FQX_LIMITS['total_bytes']:
                raise ValueError('Experiment transfer exceeds the per-run size limits.')
            self.indices.add(index)
            self.total += size
            path = self.root / ('experiment-%d.fqx' % index)
            path.touch(exist_ok=False)
            self.current = {'index': index, 'name': name, 'size': size, 'received': 0,
                            'digest': hashlib.sha256(), 'path': path}
            return
        current = self.current
        if not current or index != current['index']:
            raise ValueError('Experiment transfer has no matching start.')
        if event['type'] == 'fqx-chunk':
            value = event.get('data')
            if not isinstance(value, str) or len(value) > 4 * ((FQX_LIMITS['chunk_bytes'] + 2) // 3):
                raise ValueError('Experiment transfer chunk is too large.')
            try: chunk = base64.b64decode(value, validate=True)
            except (ValueError, TypeError): raise ValueError('Invalid experiment transfer chunk.')
            current['received'] += len(chunk)
            if current['received'] > current['size']:
                raise ValueError('Experiment transfer exceeded its declared length.')
            with current['path'].open('ab') as stream: stream.write(chunk)
            current['digest'].update(chunk)
        elif event['type'] == 'fqx-end':
            digest = event.get('sha256')
            if current['received'] != current['size'] or not isinstance(digest, str) or not re.fullmatch('[a-f0-9]{64}', digest) or digest != current['digest'].hexdigest():
                raise ValueError('Experiment transfer is incomplete or has a checksum mismatch.')
            self.completed.append({'name': current['name'], 'path': current['path'], 'sha256': digest})
            self.current = None
