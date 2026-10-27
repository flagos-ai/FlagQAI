"""Deterministic VQE artifact and failure-path regression; no model or SDK downloads."""

import hashlib
import json
import math
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import flagqai_science


class ScientificRunTest(unittest.TestCase):
    def setUp(self):
        self.sandbox = tempfile.TemporaryDirectory(prefix="flagqai-science-test-")
        self.addCleanup(self.sandbox.cleanup)
        self.root = Path(self.sandbox.name)

    def _run(self):
        return flagqai_science.start_run(
            {"task_id": "vqe-h2-two-qubit", "description": "Two-qubit ground-state VQE"},
            self.root / "results", self.root / "cache")

    def test_deterministic_vqe_creates_valid_result_and_hash_manifest(self):
        run = self._run()
        c_i = -1.052373245772859
        c_z0 = 0.39793742484318045
        c_z1 = -0.39793742484318045
        c_zz = -0.01128010425623538
        c_xx = 0.18093119978423156
        # Odd-parity ansatz; the variational path evaluates its own energy.
        a = c_i + c_z0 - c_z1 - c_zz
        b = c_i - c_z0 + c_z1 - c_zz
        def energy(theta):
            x, y = math.cos(theta), math.sin(theta)
            return a*x*x + b*y*y + 2*c_xx*x*y
        grid = [math.pi * index / 2048 for index in range(2049)]
        index = min(range(len(grid)), key=lambda item: energy(grid[item]))
        lo, hi = grid[max(0, index - 1)], grid[min(2048, index + 1)]
        for step in range(45):
            left = lo + (hi-lo)*0.3819660112501051
            right = hi - (hi-lo)*0.3819660112501051
            if energy(left) < energy(right):
                hi = right
            else:
                lo = left
            run.log_metric("energy", energy((lo+hi)/2), step=step)
        theta = (lo+hi)/2
        variational = energy(theta)
        # Independent acceptance uses both closed-form parity eigenvalues.
        even_a = c_i + c_z0 + c_z1 + c_zz
        even_b = c_i - c_z0 - c_z1 + c_zz
        exact = min((even_a+even_b)/2 - math.hypot((even_a-even_b)/2, c_xx),
                    (a+b)/2 - math.hypot((a-b)/2, c_xx))
        x, y = math.cos(theta), math.sin(theta)
        hx, hy = a*x + c_xx*y, c_xx*x + b*y
        variance = hx*hx + hy*hy - variational*variational
        run.record_validation("absolute_error", abs(variational-exact), 1e-4)
        run.record_validation("energy_variance", abs(variance), 1e-4)
        run.save_checkpoint({"theta": theta, "energy": variational})
        (run.directory / "convergence.csv").write_text("step,energy\n%d,%.16f\n" % (45, variational))
        run.save_artifact("convergence.csv")
        result_path = run.finish("passed")
        result = json.loads(result_path.read_text())
        manifest = json.loads((run.directory / "manifest.json").read_text())
        self.assertEqual(result["recorded_status"], "passed")
        self.assertIsNone(result["platform_scientific_verdict"])
        self.assertEqual(result["schema_version"], 1)
        self.assertEqual(len(result["validations"]), 2)
        self.assertTrue(all(row["recorded_pass"] for row in result["validations"]))
        self.assertLess(abs(variational-exact), 1e-4)
        self.assertLess(abs(variance), 1e-4)
        self.assertEqual({row["path"] for row in manifest["artifacts"]},
                         {"checkpoint.json", "convergence.csv", "benchmark_meta.json", "result.json"})
        for row in manifest["artifacts"]:
            content = (run.directory / row["path"]).read_bytes()
            self.assertEqual(row["bytes"], len(content))
            self.assertEqual(row["sha256"], hashlib.sha256(content).hexdigest())

    def test_preflight_rejects_unwritable_output_and_cache_before_a_run(self):
        blocked = self.root / "blocked"
        blocked.write_text("file, not directory")
        with self.assertRaises(flagqai_science.EnvironmentPreflightError) as output:
            flagqai_science.start_run({"task_id": "vqe", "description": "task"}, blocked)
        self.assertEqual(output.exception.code, "output_directory")
        with self.assertRaises(flagqai_science.EnvironmentPreflightError) as cache:
            flagqai_science.start_run({"task_id": "vqe", "description": "task"}, self.root / "results", blocked)
        self.assertEqual(cache.exception.code, "cache_directory")

    def test_invalid_metrics_and_paths_are_rejected(self):
        run = self._run()
        with self.assertRaises(ValueError):
            run.log_metric("energy", float("nan"))
        with self.assertRaises(ValueError):
            run.record_validation("error", 1, -1)
        with self.assertRaises(ValueError):
            run.finish("passed")
        outside = self.root / "outside.csv"
        outside.write_text("secret")
        with self.assertRaises(ValueError):
            run.save_artifact("../outside.csv")
        try:
            (run.directory / "link.csv").symlink_to(outside)
        except (OSError, NotImplementedError):
            pass  # Windows installations may not grant symlink creation.
        else:
            with self.assertRaises(ValueError):
                run.save_artifact("link.csv")

    def test_manifest_failure_does_not_overwrite_passed_result(self):
        run = self._run()
        run.record_validation("absolute_error", 0.0, 1e-4)
        original = flagqai_science._atomic_json
        def fail_manifest(path, value):
            if path.name == "manifest.json":
                raise OSError("simulated disk failure")
            return original(path, value)
        with patch.object(flagqai_science, "_atomic_json", side_effect=fail_manifest):
            with self.assertRaises(flagqai_science.ArtifactPackagingError) as failed:
                run.finish("passed")
        self.assertEqual(json.loads(failed.exception.result_path.read_text())["recorded_status"], "passed")
        self.assertFalse((run.directory / "manifest.json").exists())
        with self.assertRaises(RuntimeError):
            run.finish("passed")

    def test_replaced_artifact_link_cannot_enter_manifest(self):
        run = self._run()
        run.record_validation("absolute_error", 0.0, 1e-4)
        artifact = run.directory / "convergence.csv"
        artifact.write_text("step,energy\n0,-1.0\n")
        run.save_artifact(artifact.name)
        outside = self.root / "outside.csv"
        outside.write_text("private outside contents")
        artifact.unlink()
        try:
            artifact.symlink_to(outside)
        except (OSError, NotImplementedError):
            self.skipTest("symlinks unavailable on this host")
        with self.assertRaises(flagqai_science.ArtifactPackagingError) as failure:
            run.finish("passed")
        self.assertEqual(json.loads(failure.exception.result_path.read_text())["recorded_status"], "passed")
        self.assertFalse((run.directory / "manifest.json").exists())

    def test_artifact_changed_while_hashing_cannot_enter_manifest(self):
        run = self._run()
        run.record_validation("absolute_error", 0.0, 1e-4)
        artifact = run.directory / "convergence.csv"
        artifact.write_bytes(b"step,energy\n" + b"0,-1.0\n" * 100)
        run.save_artifact(artifact.name)
        actual_sha256 = hashlib.sha256

        class MutatingHash:
            def __init__(self):
                self.delegate = actual_sha256()

            def update(self, chunk):
                self.delegate.update(chunk)
                if chunk.startswith(b"step,energy") and not hasattr(self, "mutated"):
                    self.mutated = True
                    with artifact.open("ab") as stream:
                        stream.write(b"1,-2.0\n")

            def hexdigest(self):
                return self.delegate.hexdigest()

        with patch.object(flagqai_science.hashlib, "sha256", side_effect=MutatingHash):
            with self.assertRaises(flagqai_science.ArtifactPackagingError) as failure:
                run.finish("passed")
        self.assertEqual(json.loads(failure.exception.result_path.read_text())["recorded_status"], "passed")
        self.assertFalse((run.directory / "manifest.json").exists())

    def test_metadata_failure_also_preserves_scientific_result(self):
        run = self._run()
        run.record_validation("absolute_error", 0.0, 1e-4)
        original = flagqai_science._atomic_json
        def fail_metadata(path, value):
            if path.name == "benchmark_meta.json":
                raise OSError("simulated metadata failure")
            return original(path, value)
        with patch.object(flagqai_science, "_atomic_json", side_effect=fail_metadata):
            with self.assertRaises(flagqai_science.ArtifactPackagingError) as failed:
                run.finish("passed")
        self.assertEqual(json.loads(failed.exception.result_path.read_text())["recorded_status"], "passed")
        self.assertFalse((run.directory / "manifest.json").exists())


if __name__ == "__main__":
    unittest.main()
