"""Prove the mandatory CI runner rejects missing coverage, not just failures."""
import unittest
from sdk_acceptance import require_complete


class AcceptanceGateTests(unittest.TestCase):
    def result(self, function=None):
        result = unittest.TestResult()
        if function is not None:
            unittest.FunctionTestCase(function).run(result)
        return result

    def test_successful_nonempty_suite_is_accepted(self):
        require_complete(self.result(lambda: None))

    def test_empty_or_skipped_suite_is_rejected(self):
        with self.assertRaisesRegex(RuntimeError, 'collected no tests'):
            require_complete(self.result())
        def skipped():
            raise unittest.SkipTest('Missing SDK must not turn CI green')
        with self.assertRaisesRegex(RuntimeError, 'skipped tests'):
            require_complete(self.result(skipped))

    def test_failed_or_errored_suite_is_rejected(self):
        def failed():
            raise AssertionError('Incorrect measurement result')
        def errored():
            raise RuntimeError('Broken runtime')
        for function in (failed, errored):
            with self.assertRaisesRegex(RuntimeError, 'acceptance failed'):
                require_complete(self.result(function))
