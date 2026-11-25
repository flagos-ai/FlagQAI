"""Offline tests for direct-call extraction; no SDK or model required."""
import unittest
from implementation import analyze


class ImplementationTests(unittest.TestCase):
    def test_real_calls_only_including_aliases(self):
        source = '''import flagquantum as fq
from flagquantum import synth as s
# fq.run(fake)
text = "fq.save('fake')"
def prepare():
    return fq.Circuit(2)
p = s.synthesize(prepare)
fq.run(p)
'''
        self.assertEqual(analyze(source), [
            {'api': 'flagquantum.Circuit', 'line': 6},
            {'api': 'flagquantum.synth.synthesize', 'line': 7},
            {'api': 'flagquantum.run', 'line': 8},
        ])

    def test_external_helpers_are_not_claimed_as_sdk_calls(self):
        self.assertEqual(analyze('from examples.task import build\nprint("FlagQuantum")\nbuild()'), [])


if __name__ == '__main__':
    unittest.main()
