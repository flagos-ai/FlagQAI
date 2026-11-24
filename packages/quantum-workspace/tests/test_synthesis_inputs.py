"""Pinned external data is verified, explicit and never overwrites user inputs."""
from hashlib import sha256
import json
from pathlib import Path
import tempfile
import unittest
from workspace_server.synthesis_inputs import inputs, prepare


class SynthesisInputsTests(unittest.TestCase):
    def test_verified_data_stays_scoped_and_existing_research_data_is_retained(self):
        with tempfile.TemporaryDirectory() as directory:
            web = Path(directory) / 'web'
            folder = web / 'examples/synthesis-inputs'
            folder.mkdir(parents=True)
            raw = b'feature,label\n1,0\n'
            (folder / 'data.csv').write_bytes(raw)
            item = {'prefix': 'case/', 'path': 'data.csv', 'url': '/examples/synthesis-inputs/data.csv',
                    'sha256': sha256(raw).hexdigest(), 'bytes': len(raw)}
            (folder / 'manifest.json').write_text(json.dumps({'entries': [item]}))
            self.assertEqual(inputs(web, 'other/main.py'), [])
            root = Path(directory) / 'execution'
            root.mkdir()
            self.assertFalse((root / 'data.csv').exists())
            prepare(web, 'case/main.py', root)
            self.assertEqual((root / 'data.csv').read_bytes(), raw)
            (root / 'data.csv').write_text('my research data')
            prepare(web, 'case/main.py', root)
            self.assertEqual((root / 'data.csv').read_text(), 'my research data')
            (folder / 'data.csv').write_bytes(b'x' * len(raw))
            with self.assertRaisesRegex(ValueError, 'checksum changed'):
                prepare(web, 'case/main.py', root)
            self.assertEqual((root / 'data.csv').read_text(), 'my research data')

    def test_real_credit_card_input_matches_original_declared_digest(self):
        web = Path(__file__).resolve().parents[3] / 'apps/web/public'
        entries = inputs(web, 'applications/finance/credit_card_fraud/overview/walkthrough.ipynb')
        self.assertEqual(len(entries), 1)
        item, raw = entries[0]
        self.assertEqual(item['path'], 'creditcard.csv')
        self.assertEqual(sha256(raw).hexdigest(), 'cb6baeefbfd24b7b8f865b55efa366e2023b35bb125bc88a9f08a4c03724e5cd')
        self.assertEqual(len(raw.splitlines()), 949)

    def test_qgan_weights_are_pinned_and_frozen_with_the_source_snapshot(self):
        from workspace_server.synthesis_files import snapshot
        import base64
        web = Path(__file__).resolve().parents[3] / 'apps/web/public'
        entry = 'algorithms/machine_learning/qgan/qgan_bars_and_strips/overview/main.py'
        raw, metadata = snapshot(web, entry, (web / 'examples/synthesis-files' / entry).read_text())
        payload = json.loads(raw)
        self.assertEqual(len(metadata['supplemental_inputs']), 2)
        for item in metadata['supplemental_inputs']:
            self.assertEqual(sha256(base64.b64decode(payload['synthesis_files'][item['path']])).hexdigest(), item['sha256'])
        self.assertNotIn('creditcard.csv', payload['synthesis_files'])
