"""The expanded notebook is reproducible and retains the official source."""
from hashlib import sha256
import json
from pathlib import Path
import tempfile
import unittest
from cooling_walkthrough import apply, build, SLUG, VERSION

DIRECTORY = Path(__file__).resolve().parents[2] / 'public/notebooks'


class CoolingWalkthroughTests(unittest.TestCase):
    def setUp(self):
        self.catalog = json.loads((DIRECTORY / 'catalog.json').read_text())
        self.item = next(item for item in self.catalog['entries'] if item['path'] == SLUG)
        self.identity = self.item['id']
        self.bundle = json.loads((DIRECTORY / (self.identity + '.json')).read_text())

    def test_generated_cells_keep_real_definitions_and_executions_visible(self):
        raw = build(self.bundle['files'], self.catalog['revision'], self.item['upstreamNotebookSha256'])
        self.assertEqual(raw, (DIRECTORY / (self.identity + '.ipynb')).read_bytes())
        notebook = json.loads(raw)
        self.assertEqual(notebook['metadata']['flagqai']['presentation'], VERSION)
        sources = [''.join(cell['source']) for cell in notebook['cells'] if cell['cell_type'] == 'code']
        code = '\n'.join(sources)
        for source in sources:
            compile(source, '<walkthrough-cell>', 'exec')
            self.assertLess(len(source.encode()), 32768)
        for visible in ('def prepare(', 'def thermal_encoding(', 'def inverse_circuit(',
                        'def mock_qaoa(', 'synth.synthesize(', 'fq.run(inverse)',
                        'bind_parameters(', 'torch.linalg.solve(', 'fq.save(', 'fq.load('):
            self.assertIn(visible, code)
        self.assertNotIn('workflow.run()', code)
        self.assertNotIn('from .', code)
        self.assertNotIn('import full_model', code)
        self.assertIn('mock_costs_are_thermal_objectives', code)
        self.assertTrue(all(not cell.get('outputs') and cell.get('execution_count') is None
                            for cell in notebook['cells'] if cell['cell_type'] == 'code'))

    def test_original_is_hash_bound_and_reapplying_does_not_overwrite_it(self):
        upstream = (DIRECTORY / (self.identity + '.upstream.ipynb')).read_bytes()
        self.assertEqual(sha256(upstream).hexdigest(), self.item['upstreamNotebookSha256'])
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary) / 'public/notebooks'
            directory.mkdir(parents=True)
            (directory.parent.parent / 'src/data').mkdir(parents=True)
            for suffix in ('.json', '.ipynb', '.upstream.ipynb'):
                (directory / (self.identity + suffix)).write_bytes((DIRECTORY / (self.identity + suffix)).read_bytes())
            for _ in range(2):
                apply(directory, self.catalog)
                self.assertEqual((directory / (self.identity + '.upstream.ipynb')).read_bytes(), upstream)
                self.assertEqual(sha256((directory / (self.identity + '.ipynb')).read_bytes()).hexdigest(), self.item['notebookSha256'])


if __name__ == '__main__':
    unittest.main()
