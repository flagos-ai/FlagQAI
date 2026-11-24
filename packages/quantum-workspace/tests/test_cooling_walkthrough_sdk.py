"""Execute the expanded teaching cells against a real SDK in an isolated folder."""
from contextlib import redirect_stdout
import io
import json
import linecache
import os
from pathlib import Path
import sys
import tempfile
import unittest

try:
    import flagquantum as fq
    from flagquantum import synth
    AVAILABLE = callable(synth.synthesize)
except ImportError:
    AVAILABLE = False


@unittest.skipUnless(AVAILABLE, 'Requires FlagQuantum synth and PyTorch')
class CoolingWalkthroughSDKTests(unittest.TestCase):
    def test_every_code_cell_and_archived_replay(self):
        import torch
        web = Path(__file__).resolve().parents[3] / 'apps/web/public/notebooks'
        identity = '6281132ae7b11b3c3fea3e8f'
        bundle = json.loads((web / (identity + '.json')).read_text())
        document = json.loads((web / (identity + '.ipynb')).read_text())
        before = Path.cwd()
        old_path = sys.path[:]
        namespace = {'__name__': '__main__'}
        cells = []
        with tempfile.TemporaryDirectory(prefix='flagqai-cooling-cells-') as temporary:
            try:
                os.chdir(temporary)
                sys.path.insert(0, temporary)
                for name, source in bundle['files'].items():
                    path = Path(name)
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_text(source)
                with redirect_stdout(io.StringIO()):
                    for index, cell in enumerate(document['cells']):
                        if cell['cell_type'] != 'code':
                            continue
                        source = ''.join(cell['source'])
                        name = f'<cooling-walkthrough-{index}>'
                        cells.append(name)
                        linecache.cache[name] = (len(source), None, source.splitlines(keepends=True), name)
                        exec(compile(source, name, 'exec'), namespace)
                report = namespace['report']
                self.assertLess(report['thermal']['relative_error'], .04)
                self.assertLess(report['thermal']['conditional_error'], 1e-10)
                self.assertEqual(len(report['mock_trials']), 2)
                self.assertFalse(report['full_20_qubit_model_executed'])
                self.assertFalse(report['quantum_advantage_claim'])
                for filename in ('cooling-mock.fqx', 'cooling-thermal.fqx'):
                    archived = fq.load(filename)
                    replay = fq.run(archived.program)
                    torch.testing.assert_close(replay.statevector(), archived.result.statevector(), atol=1e-10, rtol=0)
                # An unchanged official workflow remains an independent comparison.
                from notebook_inputs import prepare
                prepare()
                from examples.synthesis.applications.automotive.cooling_systems_optimization.overview.workflow import run
                original = run()
                torch.testing.assert_close(namespace['computed'], original.computed, atol=1e-10, rtol=0)
                torch.testing.assert_close(torch.stack(namespace['probability_rows']), original.mock_probabilities, atol=1e-10, rtol=0)
            finally:
                os.chdir(before)
                sys.path[:] = old_path
                for name in cells:
                    linecache.cache.pop(name, None)
                for name, module in list(sys.modules.items()):
                    filename = getattr(module, '__file__', None)
                    if filename and str(filename).startswith(temporary + os.sep):
                        sys.modules.pop(name, None)
