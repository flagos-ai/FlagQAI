"""Real worker acceptance for frozen synthesis trees; no provider or model calls."""
import base64
from dataclasses import replace
from hashlib import sha256
import json
from pathlib import Path
import sys
from unittest.mock import patch

from test_python_runs import PythonRunCase
from workspace_server.synthesis_files import snapshot


class SynthesisFilesTests(PythonRunCase):
    def library(self):
        files = {
            'case/__init__.py': '',
            'case/helper.py': 'VALUE = 42\n',
            'case/data.json': '{"answer": 42}',
            'case/main.py': '''import argparse
assert argparse.ArgumentParser().parse_args().__dict__ == {}
from .helper import VALUE
from examples.synthesis.case.helper import VALUE as absolute
from pathlib import Path
import json
assert VALUE == absolute == json.loads(Path(__file__).with_name("data.json").read_text())["answer"]
print("companion files executed", VALUE)
''',
        }
        root = self.settings.web_root
        entries = []
        for name, source in files.items():
            asset = root / 'examples/synthesis-files' / name
            asset.parent.mkdir(parents=True, exist_ok=True)
            asset.write_text(source)
            entries.append({'path': name, 'url': '/examples/synthesis-files/' + name,
                            'sha256': sha256(source.encode()).hexdigest(), 'bytes': len(source.encode())})
        (root / 'examples/synthesis-files.json').write_text(json.dumps({'revision': 'a' * 40, 'entries': entries}))
        return files

    def test_real_relative_absolute_imports_data_large_edited_entry_and_frozen_evidence(self):
        files = self.library()
        source = files['case/main.py'] + '\n#' + ' large editor draft' * 2200 + '\nprint("edited version")\n'
        self.assertGreater(len(source), 32768)
        run = self.runs.submit({'source': source, 'name': 'Source example', 'synthesis_path': 'case/main.py'})
        # Editing installed example assets cannot change a queued input snapshot.
        (self.settings.web_root / 'examples/synthesis-files/case/helper.py').write_text('VALUE = 0')
        result = self.wait(run['id'])
        self.assertEqual(result['status'], 'completed', result)
        self.assertIn('companion files executed 42', ''.join(row['text'] for row in result['logs']))
        self.assertIn('edited version', ''.join(row['text'] for row in result['logs']))
        evidence = self.runs.evidence(run['id'])
        self.assertEqual(evidence['inputs']['files']['examples/synthesis/case/main.py'], source)
        self.assertEqual(base64.b64decode(evidence['inputs']['assets_base64']['examples/synthesis/case/data.json']), b'{"answer": 42}')
        saved = self.settings.database_path.parent / 'python-inputs' / (run['id'] + '.synthesis.json')
        saved.write_text('{}')
        with self.assertRaisesRegex(ValueError, 'snapshot changed'):
            self.runs.evidence(run['id'])

    def test_changed_companions_refuse_submission_without_running(self):
        files = self.library()
        (self.settings.web_root / 'examples/synthesis-files/case/helper.py').write_text('VALUE = 0')
        with self.assertRaisesRegex(ValueError, 'source files changed'):
            self.runs.submit({'source': files['case/main.py'], 'synthesis_path': 'case/main.py'})
        self.assertEqual(self.runs.store.list(), [])

    def test_missing_interpreter_is_actionable_and_never_falls_back(self):
        settings = replace(self.settings, local_python='/nonexistent/flagqai/python')
        with patch('workspace_server.python_runs.subprocess.Popen') as spawn:
            with self.assertRaisesRegex(RuntimeError, 'Open Compute environment'):
                self.runs.command(settings=settings)
            spawn.assert_not_called()

    def test_all_pinned_python_sources_parse_and_assets_match(self):
        import ast
        web = Path(__file__).resolve().parents[3] / 'apps/web/public'
        manifest = json.loads((web / 'examples/synthesis-files.json').read_text())
        selected = next(item for item in manifest['entries'] if item['path'].endswith('/main.py'))
        raw, metadata = snapshot(web, selected['path'], (web / selected['url'].lstrip('/')).read_text())
        files = json.loads(raw)['synthesis_files']
        count = 0
        for name, encoded in files.items():
            if name.endswith('.py'):
                ast.parse(base64.b64decode(encoded), filename=name)
                count += 1
        self.assertEqual(count, 1320)  # 1,318 upstream files and two package roots.
        self.assertEqual(metadata['revision'], manifest['revision'])
