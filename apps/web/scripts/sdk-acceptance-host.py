"""CI-only preview fault host. Never used by the production launcher."""
import os
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(root / 'packages/quantum-workspace/local'))
from workspace_server.experiments import ExperimentImports

control = Path(os.environ['FQ_E2E_CONTROL_DIR']).resolve()
original = ExperimentImports.import_file


def import_file(self, *args, **kwargs):
    if (control / 'preview-offline').exists():
        raise ValueError('Acceptance preview outage; original file retained.')
    return original(self, *args, **kwargs)


ExperimentImports.import_file = import_file
sys.path.insert(0, str(root / 'packages/quantum-workspace'))
from serve import main
main()
