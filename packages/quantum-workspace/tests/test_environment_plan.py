"""No invented historical pins or executable package-provided installation commands."""
import json
from pathlib import Path
import subprocess
import sys
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'local'))
from workspace_server.environment_plan import environment_plan
from workspace_server.reproduction import PROBE


def runtime():
    return {'python': '3.12.14', 'sdk_version': '0.4.0', 'sdk_distribution_version': '0.4.0', 'pytorch': '2.13.0', 'save_load_supported': True,
            'packages': {'torch': '2.13.0', 'flagquantum': '0.4.0'}, 'stdlib_modules': ['math'], 'module_distributions': {'flagquantum': ['flagquantum']}}


class EnvironmentPlanTest(unittest.TestCase):
    def test_old_package_unknowns_are_not_fabricated_and_missing_sdk_blocks(self):
        old = {'source': 'import flagquantum as fq\nimport math\n', 'runtime': {'python': '3.12.15'}}
        plan = environment_plan(old, ['0.4.0'], runtime())
        self.assertIsNone(plan['archived'])
        torch = next(row for row in plan['dependencies'] if row['name'] == 'torch')
        self.assertIsNone(torch['recorded']); self.assertEqual(torch['state'], 'unrecorded')
        self.assertFalse(plan['complete_historical_lock'])
        self.assertIn('/path/to/verified/flagquantum.whl', plan['commands'])
        self.assertFalse(plan['installation_performed'])
        missing = runtime(); missing.update(sdk_version=None, save_load_supported=False)
        self.assertTrue(environment_plan(old, ['0.4.0'], missing)['blockers'])
        broken = runtime(); broken['import_errors'] = ['torch']
        self.assertTrue(environment_plan(old, ['0.4.0'], broken)['blockers'])

    def test_recorded_dependencies_revision_and_metadata_mismatch(self):
        snapshot = runtime(); snapshot.update(sdk_revision='a' * 40, sdk_repository='https://github.com/flagos-ai/FlagQuantum.git')
        old = {'source': 'import flagquantum\n', 'runtime': {'environment_manifest': snapshot}}
        now = runtime(); now['sdk_distribution_version'] = '0.2.0'; now['pythonpath_present'] = True
        plan = environment_plan(old, ['0.4.0'], now)
        self.assertIn('git+https://github.com/flagos-ai/FlagQuantum.git@' + 'a' * 40, plan['commands'])
        self.assertIn("'torch==2.13.0'", plan['commands'])
        self.assertTrue(any('distribution metadata' in note for note in plan['notes']))
        self.assertTrue(any('PYTHONPATH' in note for note in plan['notes']))

    def test_untrusted_metadata_cannot_inject_shell_or_guess_package_names(self):
        malicious = runtime(); malicious['packages']['evil;touch /tmp/bad'] = '1.0'; malicious['python'] = '3.12\ntouch /tmp/bad'
        malicious.update(sdk_repository='https://evil.example/repo', sdk_revision='a' * 40)
        old = {'source': 'import vendor_unknown\n', 'runtime': {'environment_manifest': malicious}}
        plan = environment_plan(old, ['0.4.0'], runtime())
        self.assertNotIn('touch /tmp/bad', plan['commands'])
        self.assertNotIn('evil.example', plan['commands'])
        self.assertNotIn('pip install vendor_unknown', plan['commands'])
        self.assertEqual(plan['unresolved_imports'], ['vendor_unknown'])
        self.assertTrue(plan['blockers'])

    def test_fixed_probe_captures_inventory_without_model_or_install_requests(self):
        script = PROBE + '\nresult = runtime_manifest(fq); print(json.dumps(result))'
        process = subprocess.run([sys.executable, '-I', '-c', script], capture_output=True, text=True, timeout=25)
        self.assertEqual(process.returncode, 0, process.stderr)
        facts = json.loads(process.stdout)
        self.assertEqual(facts['schema'], 'flagqai.runtime-environment.v1')
        self.assertIn('system', facts); self.assertIn('machine', facts)
        self.assertIn('packages', facts); self.assertIn('sdk_distribution_version', facts)
        self.assertFalse(facts['pythonpath_present'])
        self.assertFalse(facts['user_site_enabled'])

if __name__ == '__main__': unittest.main()
