#!/usr/bin/env python3
"""Offline contract checks for the historical portion screen."""

import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).with_name("provenance-portion-screen.py")
SPEC = importlib.util.spec_from_file_location("portion_screen", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class PortionScreenTests(unittest.TestCase):
    def test_verified_exact_blocks_and_mismatch_rejection(self):
        old = b"one\ntwo\nthree\nfour\nfive\nsix\nold tail\n"
        new = b"one\ntwo\nthree\nfour\nfive\nsix\nnew tail\n"
        old_sha, new_sha = MODULE.git_blob(old), MODULE.git_blob(new)
        manifest = {"importCommit": "pinned", "upstreamAuditExclusions": [],
                    "expectedHistoricalCcPortCount": 1, "entries": [{"path": "src/example.ts"}]}
        tree = {"sha": "pinned", "truncated": False,
                "tree": [{"path": "src/example.ts", "type": "blob", "sha": old_sha}]}
        local_bytes = new

        def fake_git(*args):
            if args[0] == "ls-tree":
                return f"100644 blob {new_sha}\tapps/cli/src/example.ts\0".encode()
            if args[0] == "show":
                return local_bytes
            if args[0] == "rev-parse":
                return b"local-head\n"
            raise AssertionError(args)

        with tempfile.TemporaryDirectory() as folder, patch.object(MODULE, "git", fake_git):
            reference = Path(folder) / "src/example.ts"
            reference.parent.mkdir()
            reference.write_bytes(old)
            row = MODULE.screen(Path(folder), tree, manifest)["rows"][0]
            self.assertEqual(row["state"], "modified_same_path")
            self.assertEqual(row["matchedLinesInBlocksOfFive"], 6)
            self.assertEqual(row["longestExactBlock"], 6)
            self.assertEqual(row["largestBlocks"], [{"importLine": 1, "currentLine": 1, "lines": 6}])
            reference.write_bytes(new)
            with self.assertRaisesRegex(ValueError, "reference blob mismatch"):
                MODULE.screen(Path(folder), tree, manifest)
            reference.write_bytes(old)
            local_bytes = b"different local blob\n"
            with self.assertRaisesRegex(ValueError, "local blob mismatch"):
                MODULE.screen(Path(folder), tree, manifest)
            with self.assertRaisesRegex(ValueError, "complete pinned"):
                MODULE.screen(Path(folder), {**tree, "truncated": True}, manifest)


if __name__ == "__main__":
    unittest.main()
