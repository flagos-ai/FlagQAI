"""Small, local scientific-run artifact helper for the FlagQAI CLI.

This module records caller-supplied measurements. It never claims that a
model's calculation was independently verified or invents platform telemetry.
Requires only Python's standard library (Python 3.9 or newer).
"""

import hashlib
import importlib.metadata
import json
import math
import os
from pathlib import Path
import platform
import re
import stat
import tempfile
from datetime import datetime, timezone
from uuid import uuid4


SCHEMA_VERSION = 1
NAME = re.compile(r"^[A-Za-z][A-Za-z0-9_.-]{0,63}$")


class ArtifactPackagingError(RuntimeError):
    """The recorded scientific result exists, but its manifest did not finish."""

    def __init__(self, result_path, cause):
        super().__init__("Artifact packaging failed; recorded result remains at %s" % result_path)
        self.result_path = result_path
        self.__cause__ = cause


class EnvironmentPreflightError(RuntimeError):
    def __init__(self, code, path, cause):
        super().__init__("%s is not writable: %s" % (code, path))
        self.code = code
        self.path = str(path)
        self.__cause__ = cause


def _utc_now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _writable(directory):
    directory.mkdir(parents=True, exist_ok=True)
    descriptor, probe = tempfile.mkstemp(prefix=".flagqai-write-probe-", dir=str(directory))
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(b"ok")
            stream.flush()
            os.fsync(stream.fileno())
    finally:
        os.unlink(probe)


def _atomic_json(path, value):
    content = (json.dumps(value, sort_keys=True, ensure_ascii=False, allow_nan=False, indent=2) + "\n").encode("utf-8")
    descriptor, temporary = tempfile.mkstemp(prefix=".flagqai-atomic-", dir=str(path.parent))
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, str(path))
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def _digest(path):
    def identity(info):
        return (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns)

    initial = path.lstat()
    if not stat.S_ISREG(initial.st_mode):
        raise ValueError("artifact is no longer a regular file: %s" % path.name)
    flags = os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(str(path), flags)
    digest = hashlib.sha256()
    with os.fdopen(descriptor, "rb") as stream:
        opened = os.fstat(stream.fileno())
        if not stat.S_ISREG(opened.st_mode) or (opened.st_dev, opened.st_ino) != (initial.st_dev, initial.st_ino):
            raise ValueError("artifact changed before hashing: %s" % path.name)
        length = 0
        while True:
            chunk = stream.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
            length += len(chunk)
        if identity(os.fstat(stream.fileno())) != identity(initial) or length != initial.st_size:
            raise ValueError("artifact changed during hashing: %s" % path.name)
    if identity(path.lstat()) != identity(initial):
        raise ValueError("artifact path changed during hashing: %s" % path.name)
    return {"path": path.name, "bytes": length, "sha256": digest.hexdigest()}


def _version(package):
    try:
        return importlib.metadata.version(package)
    except importlib.metadata.PackageNotFoundError:
        return None


class ScientificRun:
    def __init__(self, task_spec, output_root, cache_root=None):
        if not isinstance(task_spec, dict) or set(task_spec) != {"task_id", "description"}:
            raise ValueError("task_spec must contain exactly task_id and description")
        if not isinstance(task_spec["task_id"], str) or not NAME.fullmatch(task_spec["task_id"]):
            raise ValueError("task_id must be a short stable identifier")
        if not isinstance(task_spec["description"], str) or not task_spec["description"].strip():
            raise ValueError("description must be non-empty")
        root = Path(output_root).expanduser().absolute()
        cache = Path(cache_root).expanduser().absolute() if cache_root is not None else root / ".cache"
        for code, directory in (("output_directory", root), ("cache_directory", cache)):
            try:
                _writable(directory)
            except OSError as error:
                raise EnvironmentPreflightError(code, directory, error) from error
        self.run_id = str(uuid4())
        self.directory = Path(tempfile.mkdtemp(prefix="flagqai-run-", dir=str(root)))
        self.cache_directory = cache
        self.task_spec = dict(task_spec)
        self.started_at = _utc_now()
        self.metrics = []
        self.validations = []
        self.artifacts = set()
        self.finished = False

    def _open(self):
        if self.finished:
            raise RuntimeError("run has already finished")

    def log_metric(self, name, value, step=None):
        self._open()
        if not isinstance(name, str) or not NAME.fullmatch(name):
            raise ValueError("metric name is invalid")
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise ValueError("metric value must be finite")
        if step is not None and (isinstance(step, bool) or not isinstance(step, int) or step < 0):
            raise ValueError("step must be a nonnegative integer")
        self.metrics.append({"name": name, "value": value, "step": step})

    def record_validation(self, name, value, threshold):
        self._open()
        if not isinstance(name, str) or not NAME.fullmatch(name):
            raise ValueError("validation name is invalid")
        if any(row["name"] == name for row in self.validations):
            raise ValueError("validation name must be unique")
        if any(isinstance(number, bool) or not isinstance(number, (int, float)) or not math.isfinite(number)
               for number in (value, threshold)) or threshold < 0:
            raise ValueError("validation value and threshold must be finite; threshold must be nonnegative")
        self.validations.append({"name": name, "value": value, "absolute_threshold": threshold,
                                 "recorded_pass": abs(value) <= threshold})

    def save_checkpoint(self, state):
        self._open()
        path = self.directory / "checkpoint.json"
        _atomic_json(path, state)
        self.artifacts.add(path.name)
        return path

    def save_artifact(self, relative_path):
        self._open()
        if not isinstance(relative_path, str) or not relative_path or Path(relative_path).is_absolute():
            raise ValueError("artifact must be a relative file in the run directory")
        parts = Path(relative_path).parts
        if len(parts) != 1 or any(part in (".", "..") for part in parts):
            raise ValueError("artifact must be a file at the run root")
        path = self.directory.joinpath(*parts)
        if path.is_symlink():
            raise ValueError("artifact may not be a symlink")
        if not path.is_file() or path.resolve().parent != self.directory.resolve():
            raise ValueError("artifact must be an existing regular file at the run root")
        if path.name in ("result.json", "benchmark_meta.json", "manifest.json"):
            raise ValueError("artifact name is reserved")
        self.artifacts.add(path.name)
        return path

    def finish(self, status):
        self._open()
        if status not in ("passed", "failed"):
            raise ValueError("status must be passed or failed")
        if status == "passed" and (not self.validations or not all(row["recorded_pass"] for row in self.validations)):
            raise ValueError("passed requires at least one passing recorded validation")
        meta = {
            "schema_version": SCHEMA_VERSION,
            "python": platform.python_version(),
            "platform": platform.platform(),
            "flagquantum_version": _version("flagquantum"),
        }
        result_path = self.directory / "result.json"
        _atomic_json(result_path, {
            "schema_version": SCHEMA_VERSION,
            "run_id": self.run_id,
            "task": self.task_spec,
            "recorded_status": status,
            "platform_scientific_verdict": None,
            "started_at": self.started_at,
            "finished_at": _utc_now(),
            "metrics": self.metrics,
            "validations": self.validations,
        })
        self.finished = True
        try:
            _atomic_json(self.directory / "benchmark_meta.json", meta)
            entries = [_digest(self.directory / name) for name in sorted(self.artifacts | {"result.json", "benchmark_meta.json"})]
            _atomic_json(self.directory / "manifest.json", {
                "schema_version": SCHEMA_VERSION, "run_id": self.run_id, "artifacts": entries,
            })
        except Exception as error:
            raise ArtifactPackagingError(result_path, error) from error
        return result_path


def start_run(task_spec, output_root, cache_root=None):
    return ScientificRun(task_spec, output_root, cache_root)
