"""Explicit scripted compute fixture for browser acceptance; never a provider fallback."""
from pathlib import Path
import sys
import time
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'local'))
from test_bridge import ScriptedCPU
from workspace_server.config import WorkspaceSettings
from workspace_server.service import QuantumWorkspaceService
from workspace_server.job_store import SQLiteJobStore
from workspace_server.http import create_server
class SlowScriptedCPU(ScriptedCPU):
    def execute(self, request):
        time.sleep(1 if request.get('operation') == 'compile' else 3)
        return super().execute(request)
root = Path(__file__).resolve().parents[3]
settings = WorkspaceSettings.from_root(root)
store = SQLiteJobStore(settings.database_path); store.initialize()
service = QuantumWorkspaceService(store, SlowScriptedCPU())
original_health = service.health
service.health = lambda: {**original_health(), 'mode': 'fixture', 'backend': 'test-only'}
server = create_server(settings, service)
print('TEST ONLY scripted compute fixture on http://127.0.0.1:%s' % server.server_port, flush=True)
try: server.serve_forever()
except KeyboardInterrupt: pass
finally: server.server_close(); service.close()
