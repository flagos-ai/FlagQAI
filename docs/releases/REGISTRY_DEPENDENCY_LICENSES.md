# Installed registry dependency inventory

The staged tarball check covers the eight bundled workspace packages. A clean
`npm install` also resolves registry dependencies for the host platform. Run
this separate inventory against the **installation directory**, after
installing the exact candidate tarball with an isolated HOME and npm cache:

```bash
node docs/releases/registry-license-inventory.mjs /path/to/isolated-install > registry-licenses.json
node docs/releases/registry-license-inventory.mjs /path/to/isolated-install --strict > registry-licenses.json
```

The report names each installed package, version, declared license, standalone
license/notice files and whether it came from the CLI, its bundled set, or the
registry. `readmeLicenseSummary` records a `## Licensing` section in the
installed README separately from standalone license/notice files; it does not
clear any review finding. `--strict` exits nonzero when any package needs
review. It is a screening aid, not a legal conclusion or a substitute for
reading licenses.
For packages flagged for review, `nativeArtifacts` records each regular
`.node`, `.dylib`, `.dll`, `.wasm`, `.a`, or versioned `.so` file with its
relative path, byte size, and SHA-256 digest. This identifies the exact
installed binaries for a later source/notice review. It does not attest to
their origin, licensing, or reproducible build; symlinks are not followed.
For example, the local macOS arm64 `@img/sharp-libvips-darwin-arm64@1.3.3`
registry dependency contains `lib/libvips-cpp.8.18.6.dylib` (18,164,536 bytes,
SHA-256 `bba7a98f1c4b10f4c31f92e12264e5d41a7ab484b864feae535ac8919c548d01`).
Its `versions.json` identifies libvips 8.18.6. The strict inventory still
returns one finding on this platform; the digest is evidence for comparing
the exact binary, not a release clearance.

## Pinned registry archive evidence

On 2026-10-13, `npm pack` fetched the exact published archives below. The
macOS archive's dylib digest matches the local installed package above. The
Linux and WASM digests in this table were initially from **registry archives**.
An independent Linux x64 installation on 2026-10-14 is recorded below; the
other platform rows remain archive evidence unless separately noted.

| Registry package | Archive integrity (SRI) | Native artifact (bytes) | Artifact SHA-256 |
| --- | --- | --- | --- |
| `@img/sharp-libvips-darwin-arm64@1.3.3` | `sha512-suTBPTDGrI9WodccaDdwZItTSaBYASlBk1NSfElSHrUfzu3szG6lvIF58+WiFvnfzuK8ZBFS5zE00PxqxnRiPg==` | `lib/libvips-cpp.8.18.6.dylib` (18,164,536) | `bba7a98f1c4b10f4c31f92e12264e5d41a7ab484b864feae535ac8919c548d01` |
| `@img/sharp-libvips-linux-x64@1.3.3` | `sha512-4vKmvAst9nrowcqquKFAyZJUDolUaIp8uRiN0mWFguJ1IplC9/pitXtlnnlU4aa/eJw3J7i67V+pwUL+wZGdsA==` | `lib/libvips-cpp.so.8.18.6` (18,621,496) | `536cee19ab906cb5185ad519bf87647693f5d7b55e608c92eb28607f89ca5125` |
| `@img/sharp-libvips-linux-arm64@1.3.3` | `sha512-0DaL0A6Xu6sQSQFwe4iVCrKWU2cCTItnRsYsCdxAMm9NF6twAA9BKnoqy4hqz4+azQ0JHuA26qiUKsf1XJ/v5A==` | `lib/libvips-cpp.so.8.18.6` (18,259,144) | `264d3092d69de80f5acdb71c930efec8db5bd9627f41659ed3416566b9ae34b4` |
| `@img/sharp-wasm32@0.35.4` | `sha512-zQnl4Kwp7Q6NHsENtU2T/00Zi+w3AQNwz3+UaTyVBy2FpXrzXzGjndpK61onhZjRtRpQXxCTeqw19bVyXOh7jA==` | `lib/sharp-wasm32-0.35.4.node.wasm` (8,991,731) | `d15cb27ddd05a1d259b531ab1e343f2d23aa0f6c3d5e3849afd6e85bbcfda1de` |

The `versions.json` files in all four archives identify libvips 8.18.6.
The libvips archives have README license summaries but no standalone license
file. The WASM archive includes a `LICENSE` and declares
`Apache-2.0 AND LGPL-3.0-or-later AND MIT`. Package metadata points to the
[sharp-libvips](https://github.com/lovell/sharp-libvips/tree/v1.3.3) and
[sharp](https://github.com/lovell/sharp) source repositories respectively.
These archive identifiers make a later source/notice review reproducible;
they do not establish a corresponding source build, satisfy redistribution
obligations or cover other platforms. Issue #60 (recorded in the maintainers' issue tracker)
was later closed for the current npm tarball's notices and non-bundling boundary;
the archive evidence alone was not that resolution.

## Linux x64 installed-package check

On 2026-10-14, the staged `@flagqai/cli@0.1.0` tarball from PR #151 source
tree `3c2694c28f5012f3940cb99a73f925c8f37e4a50` was installed with
`npm install --omit=dev --omit=peer` in a fresh `node:22-bookworm-slim`
Linux x64 container. The tarball SHA-256 was
`eabdc66147dd96962c100d8879945e614565760914cae89eb2baaf32cc5b02db`.
The installed CLI completed `setup` with Harness `0.2.0-rc.2`, and `doctor`
reported the managed runtime ready. The container had no `uv`, so this was
not a FlagQuantum MCP execution check.

The installed dependency inventory found 95 packages (one CLI, eight bundled,
86 registry) and **two** review findings. `--strict` exited 1 as intended:

| Installed registry package | Notice evidence | Native artifact SHA-256 |
| --- | --- | --- |
| `@img/sharp-libvips-linux-x64@1.3.3` | README licensing summary; no standalone LICENSE or NOTICE | `lib/libvips-cpp.so.8.18.6`: `536cee19ab906cb5185ad519bf87647693f5d7b55e608c92eb28607f89ca5125` |
| `@img/sharp-wasm32@0.35.4` | README licensing summary and standalone LICENSE; license terms still require review | `lib/sharp-wasm32-0.35.4.node.wasm`: `d15cb27ddd05a1d259b531ab1e343f2d23aa0f6c3d5e3849afd6e85bbcfda1de` |

Both installed hashes match the corresponding registry archives above. This
proves which prebuilds npm selected in this Linux x64 install; it does not
verify their source builds, clear the applicable notice/source-access review,
or establish requirements for a bundled installer. The CLI tarball itself
still excludes `sharp` and `@img/*`; those packages arrived as separate npm
registry dependencies during installation.

To reproduce one row without installing a foreign-platform binary:

```sh
npm pack @img/sharp-libvips-linux-x64@1.3.3 --json
tar -xOzf img-sharp-libvips-linux-x64-1.3.3.tgz package/lib/libvips-cpp.so.8.18.6 | shasum -a 256
```

The candidate tarball must be rebuilt and installed again when dependencies
or supported platforms change.

For the pinned `@flagqai/cli@0.1.0` staged tarball on macOS arm64, the isolated
production install contained 92 packages: one CLI package, eight bundled
packages, and 83 registry packages. The inventory flagged exactly one package:
`@img/sharp-libvips-darwin-arm64@1.3.3`, pulled in by the optional
`sharp@0.35.4` image dependency. Its npm metadata declares
`LGPL-3.0-or-later`; the installed README lists licenses for its constituent
shared libraries, but this package has no standalone `LICENSE` or `NOTICE`
file. The strict command exits with code 1. Track the required redistribution
review recorded in issue #60 (recorded in the maintainers' issue tracker).
Do not infer that the CLI is cleared for public release from this inventory.

The candidate `@flagqai/cli` tarball declares `sharp@0.35.4` as an optional
registry dependency. Its eight bundled workspace packages do not include
`sharp` or `@img/*`; the package boundary verifier rejects either package if
it appears anywhere inside the tarball, including under a bundled package's
`node_modules`. This preserves CLI image support while proving only the
**CLI tarball's** distribution boundary. `npm install` downloads platform
prebuilds separately. Anyone redistributing a complete installed tree,
standalone executable, or image must review and carry the applicable notices,
license texts, and source-access obligations for the exact binaries they ship.
The current inventory does not establish those obligations for a future
distribution that bundles the installed dependencies. Issue #60 closed for the
current npm tarball, which excludes them.

The upstream [sharp-libvips project](https://github.com/lovell/sharp-libvips)
describes the prebuilt library distribution. Its maintainers distinguish
the packaging scripts' Apache-2.0 license from the varied licenses of shipped
shared libraries in [issue #270](https://github.com/lovell/sharp-libvips/issues/270),
and discuss libvips's LGPL terms in
[issue #246](https://github.com/lovell/sharp-libvips/issues/246).
The CLI's optional `sharp` fallback remains intact so the imported image
handling behavior is preserved while this review is open.

At the exact upstream [v1.3.3 tag](https://github.com/lovell/sharp-libvips/tree/v1.3.3),
the [`populate-npm-workspace.sh` script](https://github.com/lovell/sharp-libvips/blob/v1.3.3/populate-npm-workspace.sh)
copies the contents of [`THIRD-PARTY-NOTICES.md`](https://github.com/lovell/sharp-libvips/blob/v1.3.3/THIRD-PARTY-NOTICES.md)
into a generated package README under `## Licensing`, then removes the separate
notices file from runtime packages. The installed macOS ARM64 package has that
README section and declares `LGPL-3.0-or-later`; the inventory still flags it
because the README is a license summary, not the complete applicable terms or
a verified source-availability path. The upstream tag and package README give
reviewers a pinned starting point, not a redistribution clearance decision.

A fresh Linux ARM64 Node 22 install and a separate Linux x64 Node 22 install
of the same staged tarball each contained 95 packages (one CLI, eight bundled,
86 registry). Each had two strict-review findings: the platform-specific
`@img/sharp-libvips-linux-arm64@1.3.3` or
`@img/sharp-libvips-linux-x64@1.3.3` (no standalone license/notice;
`LGPL-3.0-or-later`) and `@img/sharp-wasm32@0.35.4` (standalone `LICENSE`,
mixed `Apache-2.0 AND LGPL-3.0-or-later AND MIT` metadata). This extends the
platform inventory. The updated scanner found `readmeLicenseSummary: true` on
both flagged Linux x64 packages while retaining both strict-review findings;
issue #60 subsequently closed for the current npm tarball boundary. These
strict-review findings remain relevant to a future bundled distribution.


## 2026-10-16 CLI candidate refresh

A fresh macOS arm64 Node.js 24.19.0 installation of the CLI candidate
containing the managed Harness peer-cohort fixes was inventoried before
managed Harness setup completed. The initial CLI tarball SHA-256 was
`a9fd0d72a05a50ba31260b22f92657854452daf97916a5c617c19d6d86741952`.
The production installation contains **92 packages**: one CLI, eight bundled
packages, and 83 registry packages. The strict inventory exits 1 for the
same single review item, `@img/sharp-libvips-darwin-arm64@1.3.3`.

Its `lib/libvips-cpp.8.18.6.dylib` is 18,164,536 bytes with SHA-256
`bba7a98f1c4b10f4c31f92e12264e5d41a7ab484b864feae535ac8919c548d01`,
matching the prior registry and installed evidence above. Its metadata
declares LGPL-3.0-or-later; the installed README has a licensing summary,
but there is no standalone LICENSE/NOTICE file. This refresh identifies
the exact CLI dependency artifact and preserves the review finding. It
does not clear native-binary redistribution, inventory the separate managed
Harness closure, or establish that setup or a scientific task succeeded.
