"""Evidence identifies the active package instead of a shadowed installation."""
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from workspace_server.runtime_facts import runtime_manifest


class RuntimeFactsTests(unittest.TestCase):
    def test_first_distribution_matches_python_path_precedence(self):
        distributions = [SimpleNamespace(metadata={'Name': 'flagquantum'}, version='0.4.0'),
                         SimpleNamespace(metadata={'Name': 'flagquantum'}, version='0.3.1')]
        with patch('importlib.metadata.distributions', return_value=distributions), \
                patch('importlib.metadata.packages_distributions', return_value={}):
            facts = runtime_manifest()
        self.assertEqual(facts['sdk_distribution_version'], '0.4.0')
        self.assertEqual(facts['packages']['flagquantum'], '0.4.0')
