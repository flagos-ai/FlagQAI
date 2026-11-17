import importlib.util
import json
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'reuse_scratch.py'
spec = importlib.util.spec_from_file_location('scratch_reuse', SCRIPT)
scratch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scratch)

INTERFACE = ' APPEND_TO_REGISTER\tq0 r0 # mention q9\nREGISTER r0 "wire q9"\n'


class ScratchReuseTests(unittest.TestCase):
    def test_unconditional_reset_releases_zero_slot_and_pins_interface(self):
        source = (INTERFACE + 'CX q0 q5 # q5\nHMR q5 b0\n'
                  'INFO_TAG "q5 # keep this tag"\nZ_POW q9 0.125\nR q9\nCX q0 q5\n')
        candidate, report = scratch.transform(source)
        self.assertEqual(candidate, INTERFACE + 'CX q0 q1 # q5\nHMR q1 b0\n'
                         'INFO_TAG "q5 # keep this tag"\nZ_POW q1 0.125\nR q1\nCX q0 q1\n')
        self.assertEqual(report['candidate_qubits'], 2)
        self.assertEqual(report['original_qubits'], 10)
        self.assertEqual(report['pinned_interface'], [0])
        self.assertEqual(report['release_events'], [
            {'line': 4, 'logical': 5, 'slot': 1, 'reset': 'HMR'},
            {'line': 7, 'logical': 9, 'slot': 1, 'reset': 'R'},
        ])

    def test_conditional_reset_never_releases_an_unknown_state(self):
        for reset in [
            'HMR q5 b0\tif\tb2\n',
            'R q5  if b2 # guarded\n',
            'PUSH_CONDITION if b2\nPUSH_CONDITION if b3\nHMR q5 b0\n'
            'POP_CONDITION\nPOP_CONDITION\n',
        ]:
            with self.subTest(reset=reset):
                candidate, report = scratch.transform(INTERFACE + 'CX q0 q5\n' + reset + 'CX q5 q9\n')
                self.assertTrue(candidate.endswith('CX q1 q2\n'))
                self.assertEqual(report['candidate_qubits'], 3)
                self.assertEqual(report['released_resets'], 0)

    def test_interface_wires_never_enter_the_free_pool(self):
        source = ('X q7\nR q7\nX q3\nAPPEND_TO_REGISTER q7 r0\n'
                  'APPEND_TO_REGISTER b2 r0\nREGISTER r0 "interface"\n')
        candidate, report = scratch.transform(source)
        self.assertTrue(candidate.startswith('X q7\nR q7\nX q8\n'))
        self.assertEqual(report['pinned_interface'], [7])
        self.assertEqual(report['released_resets'], 0)

    def test_unknown_semantics_and_malformed_conditions_are_refused(self):
        for tail in ['UNKNOWN q1\n', 'POP_CONDITION\n', 'PUSH_CONDITION if b0\n',
                     'PUSH_CONDITION\n', 'HMR q5 if b0\n', 'R q5 unless b0\n',
                     'Z_POW q5 q9\n']:
            with self.subTest(tail=tail), self.assertRaises(ValueError):
                scratch.transform(INTERFACE + tail)

    def test_cli_emits_output_and_does_not_overwrite_existing_artifacts(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            source, candidate, report = (root / name for name in ('input.kmx', 'output.kmx', 'report.json'))
            source.write_text(INTERFACE + 'X q3\n', encoding='utf-8')
            command = [sys.executable, str(SCRIPT), str(source), str(candidate), '--report', str(report)]
            subprocess.run(command, check=True, capture_output=True)
            self.assertTrue(candidate.read_text(encoding='utf-8').endswith('X q1\n'))
            self.assertEqual(json.loads(report.read_text(encoding='utf-8'))['candidate_qubits'], 2)
            self.assertNotEqual(subprocess.run(command, capture_output=True).returncode, 0)
            candidate.unlink()
            self.assertNotEqual(subprocess.run(command, capture_output=True).returncode, 0)
            self.assertFalse(candidate.exists())
            self.assertEqual(source.read_text(encoding='utf-8'), INTERFACE + 'X q3\n')
