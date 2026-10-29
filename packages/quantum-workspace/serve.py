"""Optional local Web host. Agent execution remains in the native Harness service."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent/'local'))
from flagquantum_adapter import SSHCPUAdapter
from flagquantum_adapter.local_cpu import LocalCPUAdapter
from workspace_server.config import WorkspaceSettings
from workspace_server.http import create_server
from workspace_server.job_store import SQLiteJobStore
from workspace_server.service import QuantumWorkspaceService


def main():
    settings = WorkspaceSettings.from_root(ROOT)
    if not (settings.web_root/'assets/app.mjs').exists():
        raise SystemExit('Build the optional Web client: pnpm --dir apps/web build')
    store = SQLiteJobStore(settings.database_path)
    store.initialize()
    if settings.compute_transport not in ('local', 'ssh'):
        raise SystemExit('FQ_COMPUTE_TRANSPORT must be local or ssh.')
    adapter = LocalCPUAdapter(settings.local_python) if settings.compute_transport == 'local' else SSHCPUAdapter(settings.ssh_target, settings.ssh_port)
    service = QuantumWorkspaceService(store, adapter)
    server = create_server(settings, service)
    print(f'FlagQuantum React workspace: http://127.0.0.1:{server.server_port}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        service.close()


if __name__ == '__main__':
    main()
