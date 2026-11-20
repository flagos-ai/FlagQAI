"""Real differentiable training, data flow, ablation and FQX replay; no model calls."""
import os
from pathlib import Path
import runpy
import tempfile
import unittest

try:
    import flagquantum as fq
    HAS_TRAINING = all(callable(getattr(fq, name, None)) for name in ('Module', 'train', 'save', 'load'))
except ImportError:
    HAS_TRAINING = False


@unittest.skipUnless(HAS_TRAINING, 'Requires FlagQuantum training and save/load')
class HybridTrainingTests(unittest.TestCase):
    def test_training_consumes_all_inputs_and_replays_recorded_circuit(self):
        example = Path(__file__).resolve().parents[1] / 'examples' / 'hybrid_vqc_classifier.py'
        namespace = runpy.run_path(str(example))
        previous = Path.cwd()
        with tempfile.TemporaryDirectory() as directory:
            try:
                os.chdir(directory)
                report = namespace['main']()
                self.assertLess(report['trained']['final_loss'], report['trained']['initial_loss'])
                self.assertEqual(report['trained']['accuracy'], 1.0)
                self.assertEqual(report['no_entangler']['accuracy'], report['majority_accuracy'])
                self.assertTrue(report['trained']['gradient_checked'])
                self.assertTrue(report['trained']['parameters_changed'])
                self.assertEqual(len(report['sampling_checks']), len(report['inputs']))
                self.assertFalse(report['quantum_advantage_claim'])
                self.assertTrue(Path('hybrid-vqc-trained.fqx').is_file())
            finally:
                os.chdir(previous)
