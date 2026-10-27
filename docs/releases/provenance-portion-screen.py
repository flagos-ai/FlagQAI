#!/usr/bin/env python3
"""Measure exact surviving line blocks in pinned historical source candidates.

This is a prioritization aid, not an authorship or license verdict. The
reference files stay outside this repository and are verified against the
pinned upstream Git tree before any overlap is reported.
"""

import argparse
import difflib
import hashlib
import json
import subprocess
from pathlib import Path


REPO = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
MIN_BLOCK = 5


def git(*args):
    return subprocess.check_output(["git", *args], cwd=REPO)


def git_blob(data):
    return hashlib.sha1(f"blob {len(data)}\0".encode() + data).hexdigest()


def screen(reference_root, import_tree, manifest, ref="HEAD"):
    if import_tree.get("sha") != manifest["importCommit"] or import_tree.get("truncated") is not False:
        raise ValueError("reference tree is not the complete pinned dsh-TUI import")
    imported = {row["path"]: row["sha"] for row in import_tree["tree"] if row["type"] == "blob"}
    excluded = set(manifest["upstreamAuditExclusions"])
    candidates = [row["path"] for row in manifest["entries"] if row["path"] not in excluded]
    if len(candidates) != manifest["expectedHistoricalCcPortCount"] or len(set(candidates)) != len(candidates):
        raise ValueError("historical candidate manifest changed")
    current = {}
    for raw in git("ls-tree", "-rz", ref, "--", "apps/cli").split(b"\0"):
        if raw:
            header, name = raw.split(b"\t", 1)
            _mode, kind, sha = header.decode().split()
            if kind == "blob":
                current[name.decode().removeprefix("apps/cli/")] = sha
    rows = []
    for path in candidates:
        upstream_sha = imported.get(path)
        local_sha = current.get(path)
        if not upstream_sha or not local_sha:
            rows.append({"path": path, "state": "no_same_path_comparison"})
            continue
        upstream = (reference_root / path).read_bytes()
        if git_blob(upstream) != upstream_sha:
            raise ValueError(f"reference blob mismatch: {path}")
        local = git("show", f"{ref}:apps/cli/{path}")
        if git_blob(local) != local_sha:
            raise ValueError(f"local blob mismatch: {path}")
        old_lines = upstream.decode("utf-8").splitlines()
        new_lines = local.decode("utf-8").splitlines()
        blocks = difflib.SequenceMatcher(None, old_lines, new_lines, autojunk=False).get_matching_blocks()
        surviving = [block for block in blocks if block.size >= MIN_BLOCK]
        rows.append({
            "path": path,
            "state": "identical_import" if upstream_sha == local_sha else "modified_same_path",
            "importLines": len(old_lines),
            "currentLines": len(new_lines),
            "matchedLinesInBlocksOfFive": sum(block.size for block in surviving),
            "longestExactBlock": max((block.size for block in blocks), default=0),
            "largestBlocks": [
                {"importLine": block.a + 1, "currentLine": block.b + 1, "lines": block.size}
                for block in sorted(surviving, key=lambda block: block.size, reverse=True)[:3]
            ],
        })
    return {"currentCommit": git("rev-parse", ref).decode().strip(),
            "importCommit": manifest["importCommit"], "minimumBlockLines": MIN_BLOCK,
            "rows": rows, "rightsVerdict": "unresolved: line identity is only a continuity screen"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("reference_root", type=Path, help="external pinned dsh-TUI checkout root")
    parser.add_argument("import_tree", type=Path, help="complete Git Trees API JSON for the pinned import")
    parser.add_argument("--ref", default="HEAD", help="local Git commit to compare (default: HEAD)")
    args = parser.parse_args()
    manifest = json.loads((HERE / "upstream-provenance-markers.json").read_text())
    report = screen(args.reference_root, json.loads(args.import_tree.read_text()), manifest, args.ref)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
