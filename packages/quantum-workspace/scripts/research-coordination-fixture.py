"""Isolated JSON-lines metadata fixture for native Harness acceptance; no model or SDK calls."""
import json
from pathlib import Path
import sys
from types import SimpleNamespace

base = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(base / 'local'))
sys.path.insert(0, str(base / 'tests'))
from test_api import WorkspaceAPITests
from workspace_server.config import WorkspaceSettings
from workspace_server.research_coordination import ResearchCoordination
from workspace_server.research_coordination import source_snapshot

root = Path(sys.argv[1])
root.mkdir(parents=True, exist_ok=True)
settings = WorkspaceSettings(root, root / 'jobs.sqlite3')
if not (root / 'invsqrt').exists():
    fixture = SimpleNamespace(settings=settings)
    for identity in ('a' * 32, 'b' * 32):
        WorkspaceAPITests.saved_verifier_fixture(fixture, identity)
team = ResearchCoordination(settings)
for line in sys.stdin:
    try:
        value = json.loads(line)
        if value.get('operation') == 'research.inspect':
            result = source_snapshot(settings, 'invsqrt-' + 'a' * 32)
        elif value.get('operation') == 'research.user_review':
            result = team.act('native-parent', value['data'], actor='user')
        else:
            result = team.act('native-parent', value['data'])
        print(json.dumps({'result': result}), flush=True)
    except Exception as error:
        print(json.dumps({'error': str(error)}), flush=True)
