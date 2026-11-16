"""Exercise capability checks through the actual Python worker, without a model."""
from test_python_runs import PythonRunCase


class SynthesisPreflightTests(PythonRunCase):
    def execute_project(self, source, sdk):
        bundle = {'project': {}, 'entry': 'main.py', 'files': {
            'main.py': source, 'flagquantum/__init__.py': '',
            'flagquantum/synth.py': sdk,
        }}
        # Use the supervisor directly so the fake SDK lives only in this task's
        # interpreter, independently of the service host's installed SDK.
        import json
        import subprocess
        process = subprocess.Popen(self.runs.command(), stdin=subprocess.PIPE,
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        request = {'source': source, 'entry': bundle['entry'], 'files': bundle['files']}
        process.stdin.write(json.dumps(request) + '\n')
        process.stdin.flush()
        # Keep stdin open: EOF is the supervisor cancellation signal.
        lines = []
        for line in process.stdout:
            lines.append(json.loads(line))
        process.wait(timeout=10)
        process.stdin.close()
        error = process.stderr.read()
        process.stdout.close()
        process.stderr.close()
        self.assertEqual(process.returncode, 0, error)
        return ''.join(item.get('text', '') for item in lines), lines

    def test_missing_apis_stop_before_any_research_code(self):
        for source in (
            'print("RESEARCH STARTED")\nfrom flagquantum.synth import qfunc, QNum',
            'from flagquantum import synth as s\nprint("RESEARCH STARTED")\ns.qfunc()',
        ):
            with self.subTest(source=source):
                output, events = self.execute_project(source, 'QNum = int')
                self.assertIn('Environment check: missing FlagQuantum synth APIs: qfunc', output)
                self.assertIn('Select a compatible SDK in the compute environment', output)
                self.assertNotIn('RESEARCH STARTED\n', output)
                self.assertTrue(any(item.get('type') == 'exit' and item.get('code') != 0 for item in events))

    def test_available_api_runs_once_in_selected_interpreter(self):
        output, _ = self.execute_project(
            'from flagquantum.synth import qfunc\nqfunc()',
            'def qfunc():\n    print("SELECTED SDK EXECUTED")',
        )
        self.assertEqual(output.count('SELECTED SDK EXECUTED'), 1)
        self.assertNotIn('Environment check:', output)

    def test_plain_python_does_not_require_sdk(self):
        result = self.wait(self.runs.submit({'source': 'print("plain Python")'})['id'])
        self.assertEqual(result['status'], 'completed', result)

    def test_optional_synthesis_apis_can_fall_back(self):
        output, events = self.execute_project(
            'from flagquantum import synth as s\n'
            'if hasattr(s, "optional_api"):\n    s.optional_api()\n'
            'try:\n    from flagquantum.synth import optional_api\n'
            'except ImportError:\n    print("FALLBACK EXECUTED")',
            'QNum = int',
        )
        self.assertIn('FALLBACK EXECUTED', output)
        self.assertNotIn('Environment check:', output)
        self.assertTrue(any(item.get('type') == 'exit' and item.get('code') == 0 for item in events))

    def test_shadowed_alias_is_not_assumed_to_be_the_sdk(self):
        output, _ = self.execute_project(
            'from flagquantum import synth as s\n'
            'class Replacement:\n    def run(self): print("LOCAL METHOD")\n'
            's = Replacement()\ns.run()',
            'QNum = int',
        )
        self.assertIn('LOCAL METHOD', output)
        self.assertNotIn('Environment check:', output)
