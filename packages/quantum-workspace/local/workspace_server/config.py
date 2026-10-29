"""Local paths and provider configuration; credentials never enter frontend assets."""
from dataclasses import dataclass
from pathlib import Path
from typing import Optional
import json
import os


@dataclass(frozen=True)
class WorkspaceSettings:
    web_root: Path
    database_path: Path
    port: int = 4187
    ssh_target: Optional[str] = None
    ssh_port: int = 2222
    harness_port: int = 4096
    agent_cwd: Optional[Path] = None
    compute_transport: str = "ssh"
    local_python: Optional[str] = None
    experiment_python: Optional[str] = None
    remote_python: Optional[str] = None

    @classmethod
    def from_root(cls, root):
        local = root/'.flagqai'/'quantum-workspace'/'settings.json'
        settings = json.loads(local.read_text()) if local.exists() else {}
        return cls(
            web_root=Path(os.environ.get('FQ_WEB_ROOT', root/'apps/web/dist')),
            database_path=Path(os.environ.get('FQ_DATABASE_PATH', root/'.flagqai'/'quantum-workspace'/'jobs.sqlite3')),
            port=int(os.environ.get('FQ_PORT', '4187')),
            harness_port=int(os.environ.get('FQ_HARNESS_PORT', '4096')),
            agent_cwd=Path(os.environ.get('FQ_AGENT_CWD', root)).resolve(),
            ssh_target=os.environ.get('FQ_SSH_TARGET') or settings.get('ssh_target'),
            compute_transport=os.environ.get("FQ_COMPUTE_TRANSPORT", "ssh"),
            local_python=os.environ.get("FQ_LOCAL_PYTHON"),
            experiment_python=os.environ.get("FQ_EXPERIMENT_PYTHON"),
            remote_python=os.environ.get("FQ_REMOTE_PYTHON") or settings.get("remote_python"),
            ssh_port=int(os.environ.get('FQ_SSH_PORT', settings.get('ssh_port', 2222))),
        )
