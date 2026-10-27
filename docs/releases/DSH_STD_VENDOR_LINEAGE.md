# Pinned dsh-std vendor source and license boundary

The CLI vendors the public [T-Auto/dsh-std](https://github.com/T-Auto/dsh-std)
workspace at commit `614dfa1ac168db79fcf4577cf0ebb34e2e3b944b`.
The commit's Git tree is `8a84be12576128a3e5405a72607b9318dd85d775`.
The complete upstream tree API response was checked for truncation before
recording the 209 blob paths, modes and object IDs in
[`dsh-std-upstream-blobs.json`](dsh-std-upstream-blobs.json).

Run `npm --prefix apps/cli run verify:dsh-std-vendor-lineage`. The offline gate
reconstructs the pinned Git tree from the manifest, compares every tracked
vendored file to its indexed and working-tree bytes, rejects extra or missing
paths, and requires all 16 upstream `LICENSE` files to remain exact. At the
reviewed tree, 205 of 209 files are byte-identical. Four reviewed local
differences remain: the root `package.json` pins a newer pnpm version
(`11.26.0` instead of `11.21.0`), and one final blank line was removed from
each of the command and tool build configs and the namespace-guard Chinese
README. The gate pins these four local blob IDs so later changes require
another explicit review.

The ordinary and independent Ink staged-package checks separately require
bundled workspace dependency manifests and license files to match their
source copies. This record establishes the direct version, file boundary and
MIT notice continuity of this vendored family. It does not adjudicate every
historical upstream authorship claim or clear the distinct dsh-TUI source
concern in [the replacement plan](SOURCE_REPLACEMENT_PLAN.md). The private
repository and its history remain outside any approved public export.
