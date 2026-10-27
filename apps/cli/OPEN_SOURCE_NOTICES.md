# FlagQAI CLI source and distribution notices

The CLI is source-derived from dsh-TUI v0.14.0. Its original MIT license and
copyright notice are in `LICENSE`; the exact upstream commit and import history
are recorded in `UPSTREAM.md`. The bundled dsh-std packages retain their own MIT
license files. FlagQAI-authored changes and the bundled FlagQAI platform code
are covered by `LICENSES/FlagQAI-Apache-2.0.txt`, except where an individual
source file or package carries a different notice. Other bundled dependencies
retain their own license and notice files. The packaged `THIRD_PARTY_LICENSES`
contains the BSD-3-Clause attribution for the imported whale animation source
and MIT attributions for dsh-anchored-standard, the Pi TUI LaTeX parser,
cross-spawn command escaping, the embedded Ink renderer, the historical Yoga
layout port (removed from the current source tree),
and the Pi nano-context, TPS-meter, and working-activity UI portions identified
by source comments. The file also identifies the Codex CLI effort-animation
reference and points to the included Apache-2.0 terms. The Pi LaTeX source
retains its original license header. Build-time MathJax vendor files retain
their Apache-2.0 license and notices in the source tree.
The opt-in doctor preview also uses the published Ink 8 package (MIT;
copyright Vadym Demedes and Sindre Sorhus), distinct from the inherited
renderer source, and `string-width@8.3.0` (MIT; copyright Sindre Sorhus) for
visible-row selection. Their full licenses ship with the installed dependencies.
The current terminal layout uses the published `yoga-layout@3.2.1` package
(MIT); its license text is retained in `THIRD_PARTY_LICENSES`.
The source repository also holds Codex app-server protocol types generated
from the Apache-2.0-licensed Codex CLI 0.160.1. Their pinned source release
and matching generated digest are recorded in
`src/backends/codex/protocol/generated/README.md`; these compile-time files
are excluded from the CLI tarball.

The original FlagQAI source repository contains optional portrait PNGs and
animation-frame binaries. They were **not imported into this repository or the
CLI package** pending a separate rights review. The imported 30×30 RGB
portrait sprite has also been removed from the current source and compiled
package; without local portrait artwork the UI falls back to the licensed
pixel whale. The old sprite remains in private Git history and its underlying
artwork claim is still unresolved. This current source snapshot contains no
portrait sprite; the private development history is not approved for public
release on the strength of this notice.
Do not add excluded artwork to a release until its license and provenance have
been reviewed.

The separately licensed native Desktop source was also not imported. This
notice does not grant rights to that source or to the excluded assets.

## Optional image-processing dependency

The CLI declares `sharp@0.35.4` as an optional registry dependency to preserve
terminal image handling. The FlagQAI CLI tarball does not bundle `sharp` or
`@img/*` packages; npm may install platform-specific prebuilt packages
separately. The pinned sharp source and its license are at
https://github.com/lovell/sharp/tree/v0.35.4 and
https://github.com/lovell/sharp/blob/v0.35.4/LICENSE.

Installed packages observed in the release inventory include
`@img/sharp-libvips-<platform>@1.3.3` and, on Linux,
`@img/sharp-wasm32@0.35.4`. The corresponding upstream source,
build scripts, license and third-party notices are at
https://github.com/lovell/sharp-libvips/tree/v1.3.3,
https://github.com/lovell/sharp-libvips/blob/v1.3.3/LICENSE and
https://github.com/lovell/sharp-libvips/blob/v1.3.3/THIRD-PARTY-NOTICES.md.
The prebuilt package's README contains a licensing summary, but the exact
installed binaries and applicable redistribution obligations still require
review. The development inventory records platform-specific installed-package
hashes; those hashes are not a clearance for bundling installed dependencies
or publishing a standalone executable. The CLI tarball does not include the
prebuilt packages.
