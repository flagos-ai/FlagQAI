"""Versioned quantum-workspace boundary. No provider or HTTP dependencies."""
from dataclasses import dataclass
from enum import Enum
from hashlib import sha256
from pathlib import Path
import json
import re

CONTRACT = json.loads(Path(__file__).with_name('workspace-v1.json').read_text())
PROTOCOL_VERSION = CONTRACT['version']
LIMITS = CONTRACT['limits']


class JobStatus(str, Enum):
    QUEUED = 'queued'
    RUNNING = 'running'
    COMPLETED = 'completed'
    FAILED = 'failed'


def source_hash(source: str) -> str:
    return sha256(source.encode('utf-8')).hexdigest()


@dataclass(frozen=True)
class CircuitRequest:
    source: str
    shots: int = 1024
    seed: int = 42

    @classmethod
    def parse(cls, data):
        if not isinstance(data, dict):
            raise ValueError('Expected a JSON object.')
        source = data.get('source')
        if not isinstance(source, str) or not source.strip():
            raise ValueError('Enter an OpenQASM model.')
        if len(source.encode()) > LIMITS['source_bytes']:
            raise ValueError('Model exceeds 32 KiB.')
        if not re.match(r'\s*(?://[^\n]*\n\s*)*OPENQASM\s+[23]', source):
            raise ValueError('Real execution accepts OpenQASM 2/3. Qmod is not connected to a compiler.')
        for key, default in [('shots', 1024), ('seed', 42)]:
            value = data.get(key, default)
            if type(value) is not int or not (0 if key == 'seed' else 1) <= value <= LIMITS[key]:
                raise ValueError(f'Invalid {key}; maximum {LIMITS[key]}.')
        return cls(source, data.get('shots', 1024), data.get('seed', 42))

    def to_dict(self):
        return {'source': self.source, 'shots': self.shots, 'seed': self.seed}
