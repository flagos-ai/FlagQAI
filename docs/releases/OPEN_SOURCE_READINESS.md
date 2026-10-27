# Open-source readiness review

Reviewed on **2026-10-16**, updated **2026-10-23 (Asia/Shanghai)** for the planned source import into
`flagos-ai/FlagQAI`. The initial audit baseline was CLI main
`e34e9068f489913f3e70cd509b7802f7bf6edac8`, tree
`523e343bceccc3343f3eb3ca713f017107ca5dda`; later sections record
subsequent exact trees. This report is a technical readiness assessment;
it does not clear source rights or authorize publication.

An exact-head minimal Linux arm64 Node 22.23.3 / uv 0.13.4 clean-install
attempt at `a28dd80921708b8ccd47997260ec04a089793c15` packed archive
`af469118c71e0183ba9b0f9cb9e41139e29ffd7ef2d39472ae7d2bf21a1c03e8`
and reached the managed MCP installation, then failed building
`flagquantum==0.3.1` from source. PyPI has no Linux arm64 wheel for that
version, and the minimal image had no C/C++ compiler. Earlier Linux arm64
passes below used a build-capable environment; they do not establish a
compiler-free first install. Track the wheel/toolchain gap in
#336.

The follow-up Linux arm64 Node 22.23.3 / uv 0.13.4 acceptance on candidate
`4e21cd031896a1d3d4e1fb64b186c6e01b7798c3` used Debian `build-essential`
and staged archive SHA-256
`a69d8be38397d3378bdcc6c50cd919cf50b91a10669841b79a2747735910ef8e`.
It exited 0 after clean CLI and managed Harness `0.2.1-rc.2` installation,
the FlagQuantum 0.3.1 source build, first/repeated setup, doctor, a real
installed MCP VQE preflight, the scripted MCP launcher/tool checks, and the
default-entry PTY's draft editing, provider routes, local scripted Agent turn,
and `/exit` code 0. The scripted turn did not make a paid model request or
perform a real VQE calculation. The reproducible toolchain and commands are in
[Linux arm64 installed acceptance](LINUX_ARM64_ACCEPTANCE.md). This establishes
the source-build path with a compiler, not a compiler-free installation.

## Priority and release decision

**The current candidate is not ready for a public CLI release.** Complete the
P0 items before importing a reviewed public snapshot with installation claims.
Public source availability and npm publication are separate milestones.

The maintainer confirmed on **2026-10-17** that there are no additional
authorization or independent-implementation records for #86/#93, then
explicitly resumed independently sourced TUI replacement on **2026-10-19**.
The [source replacement plan](SOURCE_REPLACEMENT_PLAN.md) records the work
order and the [official Ink host probe](../../tests/official-ink-host/README.md)
records isolated feasibility checks. Neither changes the default renderer or
clears rights to the current source. A later pinned `yoga-layout@3.2.1`
replacement removed the historical TypeScript layout port; the remaining renderer
still requires source-rights review. Windows and hosted
CI execution are still required before release. No replacement is cleared by
the resumption decision alone.

| Priority | Unresolved item | Evidence | Completion condition |
| --- | --- | --- | --- |
| **P0** | Current-source provenance and redistribution review | Source review issues #86 and #93 are open. The fresh candidate screen still reports unresolved lineage. | Record a defensible disposition for all affected source families, helpers, fixtures, and assets; obtain the necessary rights evidence or independently sourced replacements. Retain applicable notices. |
| **P1** | Apply the verified public-history import path to the final approved snapshot | `flagos-ai/FlagQAI` has public LICENSE-only root `31e87d4723e530f08d68371798729a618ea716bd`. The verifier now supports preserving that exact approved root plus one source-import commit, with eight passing history tests. | After source-rights clearance, verify the exact approved source tree using `--public-license-base` and retain the existing public LICENSE. No remote rewrite is needed; no export has been performed. |
| **P1** | Hosted CI cannot execute | Exact-head PR #303 triggered run 39385445987 for feature commit `3c5776af54753c4ad7a567eb308c8f5cb8428b9a`. All four platform jobs executed zero steps. The Ubuntu 22 check annotation says recent account payments failed or the spending limit needs to be increased. | The account owner resolves the account restriction, then reruns the private candidate CI. No source is exported to a public repository as a billing workaround. |
| **P1** | Complete Windows and hosted CI acceptance | macOS arm64 Node 24, Linux arm64 Node 22, and Linux x64 Node 22 now pass clean setup, scientific-helper tests, default-entry PTY editing, provider configuration, one scripted Agent turn, and normal exit. The separate fresh Anthropic-format gateway API acceptance also passes. No self-hosted runner is registered for the source repository. Windows issue #67 remains open; its current defaults are `danger-full-access` and approval `never`. | Obtain an actual Windows and hosted matrix result for the candidate. Windows CI now explicitly installs uv and prewarms the real pinned MCP before the PTY deadline; this recipe is not a Windows pass. |
| **P1** | Final export inventory and public documentation need a last pass | Baseline source/package inventories are available, but they do not include future rights replacements. The ordinary Windows user-guide link targets the public release checklist. Root and CLI READMEs and packaged notices now give self-contained explanations; staged-package verification rejects links to private issues in those user-facing files. Private links in audit records identify historical evidence. | Inventory the exact final approved commit and tarball, complete rights resolution, and publish a self-contained resolution summary. Keep historical provenance references accurate. |
| **P2** | Public collaboration settings | Contribution/security files and issue templates are now present locally. The repository settings are outside this source change. | Configure maintainers, branch protection/rulesets and private vulnerability reporting in the target organization. Verify the security contact and reporting channel before launch. |
| **P2** | npm and standalone distribution | CLI and internal packages deliberately remain `private: true`; no stable package or native release assets are available. | Source-only release may keep these guards. For npm publication, separately review the package boundary and version, then publish and test the real registry artifact. For standalone executables, review bundled native dependencies and the updater's missing-checksum compatibility policy. |

## Managed Harness 0.2.1 transition

The managed installation now pins Harness `0.2.1-rc.2` and its published
plugin cohort. The `dsh-invariants` companion remains at its last published
`0.2.0-rc.2` build. Run `flagqai setup --refresh` after installing a new CLI
archive over an older preview of the same CLI version; `flagqai doctor` must
report the new Harness version. The isolated installed-package acceptance is
`node apps/cli/scripts/verify-quantum-task.mjs --clean-install --real-mcp
--research-vqe` after compiling the CLI. Windows installed-package
compatibility remains unverified.

On **2026-10-20**, the switched default passed all 160 local build gates and
the staged package boundary (2,899 files, 32 entry targets). A code-equivalent archive
SHA-256 `d3f64bfb804645949fab2a8ef12e334da1ed70521faf7c612192fa8bb6afeee6`
passed a fresh macOS arm64 npm install under an isolated HOME, managed Harness
`0.2.1-rc.2` setup/repeat setup/doctor, real public FlagQuantum MCP 0.3.1
Bell and six-tool research preflight, scripted Agent VQE call, independent
energy/variance checks, session restart/resume, and API failure recovery.
The independent research VQE energy error was `9.53e-7` Ha and variance
`1.58e-6` Ha². This is no-cost scripted-model evidence, not a live provider
claim or Windows result.

The preceding code-equivalent `950f4bb9…` archive also passed a disposable `linux/amd64` Node 22
clean npm install (x64 emulated on an arm64 host), managed Harness
`0.2.1-rc.2` setup/doctor, and a real public MCP 0.3.1 H₂ VQE preflight:
26 tools including the six research tools, bounded local execution, and
evidence validation. The CPU-only resolver installed `torch 2.14.1+cpu`.
The preflight sent no model request; its `toolUseObserved=false` and
`scientificResultValidated=null` fields are expected for a pre-inference check.

The merged source tree `6b5ed8a122aea8a0efc914cb0a207700443a49ee`
also passed a disposable native **Linux arm64 Node 22.23.3** clean npm
installation. Its staged archive SHA-256 was
`a5b23448ba1a74fd7f7f3e218c3578bfa01aba422bb4a72bf2d039dbcf6438b5`.
First/repeated setup, managed Harness `0.2.1-rc.2`, real public FlagQuantum
MCP 0.3.1 with CPU-only torch, six-tool H₂ research preflight, scripted-model
VQE with independent energy/variance checks, restart/resume, API-failure
recovery, and installed real-PTY draft editing, provider routes, local Agent
turn, and `/exit` code 0 passed. The VQE error was `9.53e-7` Ha and variance
`1.58e-6` Ha². This did not use a paid provider and does not validate Windows.

On **2026-10-19**, the former temporary managed candidate passed isolated npm install,
first and repeat setup, doctor, real pinned FlagQuantum MCP Bell and six-tool
research preflight, and scripted-model VQE through the installed Harness Agent.
The independent VQE checks measured energy error `1.88e-9` Ha and variance
`3.07e-9` Ha². The 160 local build gates and staged package check (2,894 files,
32 entry targets) passed. A separate macOS arm64 PTY probe opened and exited
the candidate TUI without a provider request. These are local macOS checks,
not Windows or paid-model acceptance.

The same candidate was also exercised in a disposable **Linux arm64 Node
22.23.3** container from a read-only source mount. The packed archive SHA-256
was `3e5c28b3f13db76b654013cb8bc5baffb7d47435595808f046e4257119451322`.
Clean setup, repeat setup, doctor, dependency isolation, scripted Bell tools,
restart/resume and API failure recovery passed. With
`FLAGQAI_ACCEPTANCE_PTY_MODULE=/repo/apps/cli/scripts/linux-script-pty.cjs`, the
installed CLI also passed a real PTY first screen, draft edit/clear, provider
wizard, one local scripted Harness Agent turn, and `/exit` with code 0. The
PTY provider wizard runs after the clean-profile API assertions because it
writes credentials; this ordering is part of the acceptance contract. This
Linux run used a deterministic MCP fixture and local model, not the real
FlagQuantum distribution or a paid provider. Windows remains unverified.

## Product naming follow-up

The maintainer subsequently requested unifying product naming without old
configuration compatibility. [The naming record](FLAGQAI_NAMING.md) identifies
the current command, profile, environment, data-path and package names.
The renderer implementation and Yoga engine remain the restored versions;
this naming-only follow-up supersedes the previous restoration's exact package
hash. Historical acceptance results below describe their pinned candidates;
new naming-candidate validation is recorded separately.

### Naming-candidate validation

Runtime commit `b7a66bc66f99d98d1b1cf2947e7df57ce3582ad9` builds with Node
24.19.0 and pnpm 11.26.0. Its complete local regression passed **146/146 gates**
in **32.4 seconds**, including three new isolated naming/configuration tests.
The guide check, twelve package-boundary/bundled-notice tests, staged-package
verification, updater/private-preview checks, checksum fixture, extraction
checks, and standalone cache guard pass. The source inventory has **3,088**
tracked files; the tarball has **2,891 files and 32 entry targets**, with no
non-file or binary findings.

The final archive SHA-256 is
`a156c7cec65601e26ae0b467bf75b80e6e3729763781004b2667f5700a4cb37f`;
its package content digest is
`980135f3dfe9c588b3fb0449855f8c77d6df6a9bd2f039ef7e364fa9c01c30a1`.
That exact archive passed a fresh macOS arm64 Node 24 installed acceptance:
setup/refresh/no-op setup, doctor, default-entry quantum preflight with an
explicit MCP fixture, seven scientific-helper tests, durable/redacted permission
evidence, real PTY draft editing/clearing, provider wizard, one local scripted
Agent turn, and normal exit. No paid model endpoint was used. An earlier
naming candidate also passed, but the hashes above identify the final payload.

The stable Yoga engine and its layout adapter match `aa2830b` byte-for-byte.
Original licenses and source provenance notices remain unchanged. These
naming results do not constitute new real-MCP scientific or Windows acceptance;
prior platform results below describe their earlier pinned candidates.
The maintainer deferred remaining source replacements and hosted/Windows
execution. Later report-only edits do not change this tested package payload.

## Fixes prepared in this branch

- Replace the root README with the science/quantum overview, accurate local
  packaging instructions, Bell example, and executable Python recording example.
  Use `flagqai` as the user entry; remove `flagqai quantum` instructions from
  both root and CLI READMEs. Compatibility code remains in place.
- Update the README's MCP information to `0.3.1`, describe the research-tool
  preflight without claiming a later scientific result is validated, and keep
  Web/Desktop identified as future clients.
- Point CLI package metadata, the updater repository, star actions, splash
  links, clone guidance, and generated guide source links at `flagos-ai/FlagQAI`.
  Preserve compatibility profile/data paths and historical attribution.
- Regenerate bundled guide chapters from their canonical sources.
- Add `CONTRIBUTING.md`, `SECURITY.md`, and bug/feature issue forms. The existing
  PR template already covers verification and distribution boundaries.
- Restrict the CI token to `contents: read`.
- Ignore local `dist/`, `results/`, Python caches, and macOS metadata.
- Replace an upstream personal project path with `/home/demo/project` in two
  synthetic terminal demonstration scripts. Do not rewrite pinned fixtures.
- Repair the updater checksum regression's release-only fixture: use a
  disposable non-private installed package for fallback checks, while explicitly
  checking that the real private preview makes no registry request. The
  production preview update guard remains unchanged.

## Follow-up fixes under acceptance

- Managed npm setup now pins `cordis-plugin-loader@1.0.5` and
  `cordis-plugin-include@1.0.9`, matching the source lockfile. Profile pnpm
  now also receives the 64 direct Harness-cohort overrides from the validated
  source workspace, excluding dev-only SQLite selectors; unrelated workspace
  settings and comments are retained. Malformed configuration is rejected
  without replacement. Readiness checks reject a stale dependency pair and
  cause setup to repair it even if Harness and pnpm versions already match.
- The installer regression now covers both installation policies, workspace
  preservation, malformed overrides, stale dependency repair, refresh
  rollback, and credential retention. Its obsolete quantum error-text
  assertion was updated to the current default-session message.
- `verify:installed-runtime` is part of the unified build regression suite,
  increasing it to 146 gates; all 146 passed in 122.2 seconds after the full cohort fix. The macOS real-MCP clean-install run now passes; interactive and other
  platform/protocol checks remain separate gates.
- Cold-install diagnostics: `FLAGQAI_ACCEPTANCE_INSTALL_TIMEOUT_MS` can set
  a bounded 1-second to 1-hour install timeout without changing default limits.
  `FLAGQAI_ACCEPTANCE_KEEP_SANDBOX=1` retains only failed scripted acceptance
  runs for diagnosis; live-provider sandboxes still clean up. The latest
  retry uses a 30-minute installation limit, a fresh HOME/cache, and no live
  model.
- `--public-license-base <approved-root-oid>` accepts exactly one reviewed
  import after an approved LICENSE-only public root. The eight history tests
  cover a valid import, wrong source/base IDs, extra history/refs/remotes,
  unreachable private objects, non-license base contents, and license
  replacement. CI runs these tests. No source was uploaded.

## Verification and observed limits

### Source and package checks

- Frozen source dependency installation and compilation succeeded. A repeat
  with Node.js **24.19.0** and pnpm **11.26.0** checks the documented toolchain.
- The follow-up CLI regression suite passed **146/146 gates** (122.2 seconds, two
  workers, Node.js 24.19.0, isolated per-gate homes). It used source/runtime
  fixtures, not a live model or a clean registry-installed Harness.
- **27/27** focused package-boundary, notices, packer, npm resolver, fresh-import,
  provenance-status, and release-inventory tests passed. The guide renderer's
  focused test and all 20 bundled chapter checks passed.
- Star-action, splash-link, and updater checksum checks passed against the new
  repository identity. Their external actions were mocked; no real star,
  download of a release, or replacement of a user's executable occurred.
- Staged package verification passed: **2,892 files and 32 entry targets** after adding the profile-cohort manifest.
- The README Python integration example ran successfully against the bundled
  helper: integral `1.9999999836`, absolute error `1.645e-08`, recorded status
  `passed`, with result, metadata, checkpoint, and manifest files generated.

### Source/privacy inventory

The committed baseline contains **3,079 tracked entries** and its staged
tarball **2,891 files**. The inventory reported no non-file source entries,
binary source bodies, or binary tarball bodies. These counts identify a file
boundary; text-only content can still require provenance/privacy review.

A pattern scan of the baseline tracked files found no private-key block,
GitHub-token pattern, or AWS access-key pattern. The sole long provider-token
match is an explicit fake test value in `verify-claude-auth.ts`. The tracked
`.npmrc` contains a peer-dependency option, not credentials. Personal absolute
paths in two synthetic demonstration scripts were normalized. Other path
matches were reviewed as generic fixture/test paths or examples. This is a
pattern-based current-tree screen, not exhaustive secret detection or an audit
of the private repository's historical objects.

All **86 pinned imported test fixtures** passed the existing blob-lineage and
basic address/token check. Their imported origin remains documented in
[fixture lineage](FIXTURE_SOURCE_LINEAGE.md); a matching hash is not an
independent rights decision.

The fresh upstream candidate check used the complete Git Trees response for
fixed import `c2eee95218d1decfce138f7d31ef7099cc391d00`. Of 57 historical
candidate paths, **0** are byte-identical at the old path, **46** are modified
at the old path, **11** are absent, and **0** are exact-blob relocations.
This is a lineage classification. Modified and absent files can retain
affected portions; the result does not establish independent authorship.

### Installed acceptance

The final package was installed with npm in an isolated directory/home using
Node.js 24.19.0. The subsequent managed Harness setup failed on the missing
stable dependency failure recorded below. The requested command was:

```sh
node apps/cli/scripts/verify-quantum-task.mjs \
  --clean-install --real-mcp --vqe --interactions --todo-policy
```

No live provider, host credentials, or paid model was used. A follow-up cold run with the foundation pins successfully installed 539
Harness packages in eight minutes, then failed during native profile peer
resolution: `@deepseek-ai/dsh-scope@>=0.1.1 <0.2.0-0` has no matching stable
release. At that time the source workspace pinned the package to `0.2.0-rc.2`.
The subsequent candidate shipped that full 64-package cohort as
`bin/runtime-profile-overrides.json`, validates it against the source
workspace in the installer regression, and verifies the file is present in
the staged package (now 2,892 files). Its new cold acceptance passed the installed macOS API workflow described below.

The follow-up CLI production dependency inventory contains 92 packages and
retains one strict review finding for the optional registry-supplied libvips
binary; its hash matches the earlier evidence. See
[the refreshed dependency record](REGISTRY_DEPENDENCY_LICENSES.md#2026-10-16-cli-candidate-refresh).

### Successful macOS cold acceptance (2026-10-17)

The fresh macOS arm64 Node.js 24.19.0 run completed with exit 0 after the
full Harness profile-cohort fix. The input tarball SHA-256 was
`a9fd0d72a05a50ba31260b22f92657854452daf97916a5c617c19d6d86741952`.
It installed the CLI from a local tarball and all managed dependencies from
the public registries in an empty HOME/cache, with no host module links.
The model was a local scripted endpoint; MCP was real pinned `0.3.1`.

Passed checks:

- Harness setup and native profile installation, followed by a ready no-op
  setup and dependency-tree relocation checks.
- Bell simulation and one-step generic VQE trainer preflight.
- Six-tool H2 research preflight, including bounded execution and independent
  evidence checks. This does not validate a later user calculation.
- Catalog-provider discovery with rejected-key redaction, retry, and persisted
  configuration; Bell simulation, OpenQASM export, and file creation through
  actual Harness-observed MCP calls.
- The retrospective two-qubit VQE trainer called once for 150 steps:
  independent energy error `1.8784060973331407e-9` and variance
  `3.0662423711191877e-9`. The Hamiltonian and limits are those specified in
  `verify-quantum-task.mjs`; this is a narrow numerical regression.
- Native one-shot permission handling and one approved write, cancellation
  receipt plus terminal stopped state, Todo guidance on first/resumed turns,
  restart/resume, and scripted-provider error handling.

This establishes the installed API/quantum path on macOS arm64. The run did
not exercise a real PTY or a live paid model. The separate macOS Anthropic-format gateway cold acceptance also completed
with exit 0, covering provider rejection/retry/redaction, persisted gateway
configuration, Bell fixture calls and files, approval/cancellation, Todo
guidance, restart/resume, and API failure recovery. Its model and MCP were
both deterministic fixtures, so this adds protocol/interaction evidence,
not another real quantum calculation.

macOS and Linux interactive first-run acceptance remain separate gates.
The first Linux arm64 Node 22.23.3 run completed setup, native profile
installation, directory write/sync checks, and seven scientific-helper tests,
but its PTY timed out at the initial MCP startup. A minimal Linux PTY
entry/preflight diagnostic passes. The scripted MCP fixture independently
failed to answer legal request ID zero; that protocol bug is fixed and
covered by a new test. It is not assumed to be the sole cause of the TUI
timeout. The corrected Linux arm64 Node 22.23.3 run then completed with exit 0.
It passed all seven scientific-helper tests, default-entry terminal rendering,
draft editing/clearing, provider configuration, one local scripted Agent turn,
and `/exit` with code 0. Its input tarball SHA-256 was
`3a7b93b655283a874e347b77c37b2fe777868aea316522a0c306199940ac93ab`.

The macOS arm64 Node 24.19.0 first-run suite also completed with exit 0 using
the same default-entry tests and seven scientific-helper tests. The input
tarball SHA-256 was
`237f537852c140efc791ad1461bc5161f9897db1f6fae11d1f06541191c61827`.
The PTY driver was temporary `node-pty@1.1.0`, prepared by the CI prebuild/
postinstall procedure and verified with a real child process. Both interactive
runs used explicit MCP and model fixtures; neither claims a live model run.
The separate macOS API acceptance above supplies the real-MCP evidence.

The same Linux x64 Node 22.23.3 first-run suite completed with exit 0,
including the explicit installed-launcher fixture identity check, all seven
scientific-helper tests, PTY editing, provider routing, one scripted Agent
turn, and clean exit. Its input tarball SHA-256 was identical to the arm64
run: `3a7b93b655283a874e347b77c37b2fe777868aea316522a0c306199940ac93ab`.
The cached x64 platform image was selected with pulling disabled; the
default arm64 image label was left unchanged.

The repository runner API reports zero self-hosted runners. The private
candidate PR now has an actual hosted attempt, but all four jobs were
rejected with zero steps and the billing/spending annotation above.
Windows CI now explicitly installs pinned uv and prewarms the real MCP
before the short PTY screen deadline, since the POSIX launcher fixture
is not executable there. It also requests the provider wizard and one
scripted Agent turn. This recipe is syntax-checked but Windows remains
unverified until a real Windows job runs.

### Packed-content privacy screen

A current staged tarball with 2,892 files was screened for private-key blocks,
GitHub/provider token patterns, AWS access IDs, absolute user paths, and
private IPv4 URLs. No key/token/private-network pattern matched. The only
absolute-path match is the generic `/home/user/file.js` error-reporting
example in compiled `ErrorOverview.js`; it is not a developer's real path.
This complements the source-tree scan; it is pattern-based evidence rather
than exhaustive secret detection or a review of old private Git objects.

### Exact runtime-candidate verification

Runtime commit `aa2830bb2dfd992a3bd4ce798e2104604b239e8d` was rebuilt
with Node 24.19.0 and pnpm 11.26.0 after the private PR was created.
Its full local CLI regression passed **146/146 gates** in **118.9 seconds**.
The separate updater checksum/private-preview checks passed. Source and
package inventories contain 3,086 tracked source entries and 2,892 staged
files, with no non-file/binary findings.

Rebuilding this exact commit preserved the package content digest:
`0238d045eb424ec088f54dddf117e0e439a36b9d71174edb0f5c0a4d0815dd46`.
This compares path, mode, size, and SHA-256 per packaged file rather than
tar/gzip metadata. A later documentation-only update to this report does
not change the tested runtime payload.

The draft PR remains private and does not merge or approve the release.
Account administration and source-rights evidence remain external inputs;
no local test result substitutes for either.

### Stable-runtime restoration after deferred migration

On 2026-10-17, the maintainer requested retaining the verified runtime and
stopping the remaining source replacements. The uncommitted official Yoga
migration and related compatibility edits were withdrawn. CLI source and its
lockfile again match runtime commit `aa2830b`; the added registry Yoga
dependency was removed, and the restored build passed. The rebuilt package
content digest is identical to the verified candidate above.

An additional direct `verify-text-wrap-geometry.tsx` probe, outside the
146-gate regression list, fails on this restored source: the 20-column
fixture reported 1,600 rows against 1,800 expected. This was unresolved at
restoration time and is fixed by the subsequent correction below. The
historical 146-gate result did not cover this probe.

### Word-wrap height correction

Runtime commit `3b008972eeba5fde583b8858c512e0ffacaa1f61` fixes the subsequent
long-text discrepancy. Plain-text measurement now counts the rows produced by
the existing painter's word-wrap function. Whole-word gaps previously made the
cell-width estimate too short, clipping the message tail. The original
20-column fixture now produces its expected 1,800 rows. An independent
8-column golden checks four wrapped lines and a visible fifth-line tail.
The renderer, local Yoga implementation, and layout adapter are retained;
source replacements remain deferred.

With Node 24.19.0 and pnpm 11.26.0, the build and **148/148 local regression
gates** passed (30.9 seconds). Word-wrap geometry and text-measure cache checks
are now registered in the unified regression and CI. Staged-package checks
passed for **2,891 files and 32 entry targets**. Source inventory contains
3,088 entries, with no non-file/binary findings.

Archive SHA-256:
`607796e5f204bd0b0fd409b8405274966b7daa9d9b3fe47ce7ae6fccbe855290`.
Package content SHA-256:
`7b761892eefd2fd3dfda31ebd9bbd7ab4fddeef6c859ef72366de133d94341bb`.

That exact archive passed fresh macOS arm64 setup/refresh/doctor and real PTY
acceptance: draft editing/clearing, provider routes, a local scripted Agent
turn, and clean exit. Seven scientific-helper tests and installed quantum
fixture/preflight probes passed. No host credentials or paid model were used.
The final installed-renderer probe also passed against both the cold global
installation and the managed-profile installation, checking one and 200
paragraphs and the visible final marker. The long first-run process started
before that probe was added to its harness, so the exact final probe body was
executed separately against both installed copies of the same compiled payload.

Evidence is retained outside the source tree in the sibling
`FlagQAI-opensource-audit-evidence` directory as `flagqai-wrap-*` logs/inventory
and `word-wrap-completion-audit.json`. Documentation-only commits after the
runtime commit above do not change the tested package payload. These results
do not add Windows, hosted CI, real-provider, or real-MCP coverage; source-rights
issues remain unresolved.

### Update deadline and plugin-panel completion

Runtime commit `d142f7982c67d8e2066bca979918e7f2cd22d71c` fixes three additional
issues without replacing the renderer or Yoga:

- Standalone release downloads retain the five-minute deadline until the entire
  asset body has been read. Stalled headers, stalled bodies, and continuously
  trickling bodies abort, preserve the current executable, and clean staging.
  The deadline is injectable for deterministic local regression tests.
- The active panel's compact view renders in a bounded 1–3 row slot when the
  fullscreen sidebar is collapsed or too narrow. Draft editing and image
  previews suppress that slot. Compact-only descriptors also render when
  opened in the sidebar. Host React/hooks, width, badge updates, clipping,
  crash isolation, and session disable are covered by rendering tests.
- Plugin subscriptions receive committed full-sidebar open/close/focus/blur
  transitions and `sidebar-toggled` with its `open` state. Switching, external
  collapse, width changes, editor coverage, and unmount are covered. Repeated
  identical views produce no duplicate events; foreign-plugin events remain
  filtered. Compact display does not imply full-panel visibility or focus.

The Node 24.19.0 / pnpm 11.26.0 build passed. The unified suite now includes
plugin panels and standalone checksum/deadline tests: **150/150 gates passed**
in **30.5 seconds** (10 workers). Staged-package verification passed for
**2,894 files and 32 entry targets**. The committed source inventory has
**3,089 entries** and no non-file/binary findings.

Archive SHA-256:
`4d06c6f8c6dbc985402c8da058334ce6e85e6a35da59c81e40b05395b387162a`.
Package content SHA-256:
`74afe459bac82fcef32651501bed1d72d26f8693780bb443b1f0bca05a5a4c76`.

That exact archive passed fresh macOS arm64 Node 24 installed acceptance:
setup/refresh/doctor; compiled word-wrap, compact-row, lifecycle and download-
deadline probes; quantum directory write-and-sync and explicit MCP fixture
preflight; seven scientific-helper tests; and real PTY draft editing/clearing,
provider routes, a local scripted Agent turn, and normal exit. No host
credentials or paid model endpoint were used. The initial attempt stopped at
the legitimate less-than-2-GiB disk-space guard after its compiled probes had
passed. Generated temporary acceptance/download caches were cleared and a new
isolated run passed without a runtime change. Both attempt logs are retained.

Evidence is retained outside the repository in the sibling
`FlagQAI-opensource-audit-evidence` directory, including
`panel-update-completion-audit.json`. Documentation-only follow-ups do not
change the tested payload. These results add no Windows, hosted CI,
real-provider, or real-MCP coverage; source-rights review remains unresolved.

### Registry-backed panel selection

Candidate `3264e361e5c54782a4578bbb0eba1e1744e0bc4e` includes runtime fix
`2e7e023cb950dc4497c1d43648d7065129df2218` and the installed-probe path fix.
The controller now subscribes to the live panel registry and intersects it with
the configured enabled order. Full and compact renderers use that resolved
selection. Keyboard dispatch, cycling, numeric shortcuts, commands and lifecycle
events therefore address the same registered panel when configuration contains
unavailable plugin IDs. Preferences retain those IDs for later activation.

Removing the active panel selects the first remaining valid panel. The resolved
fallback becomes session state, preventing a later registration from restoring
a removed selection or taking focus from the current panel. An empty registry
collapses the sidebar and leaves chat keys available. No renderer or Yoga
replacement is involved.

The Node 24.19.0 / pnpm 11.26.0 build passed. **151/151 regression gates passed**
in **36.3 seconds** (10 workers), including the new registry-selection gate.
It covers stale IDs, actual panel input delivery, numeric/cyclic navigation,
commands, lifecycle transitions, active removal, re-registration, empty-state
input and preservation of configured preferences. Staged-package verification
passed with **2,894 files and 32 entry targets**; the committed source inventory
has **3,090 entries** with no non-file/binary findings.

Archive SHA-256:
`64c188db83ff8f30838f4c6ed22ab96602267228c49ca0049ad0507cca69d9a0`.
Package content SHA-256:
`97f61ce29b52ac3147e9b4f5388834ac2ba45d1c020975ab03c576a2dd328cbf`.

The registry-selection probe also passed against the compiled managed package.
Its initial test-only dependency-resolution failure under pnpm was corrected by
resolving the package root through its real filesystem path. A new clean run
of the identical archive passed setup/refresh/doctor, the compiled selection
probe, earlier word-wrap/panel/deadline probes, quantum write-and-sync/preflight
fixtures, seven scientific-helper tests, and real macOS arm64 PTY draft
editing/clearing, provider routes, a local scripted Agent turn and clean exit.
No host credentials or paid model endpoint were used. Evidence is retained in
the sibling `FlagQAI-opensource-audit-evidence` directory, including
`panel-selection-completion-audit.json`. Documentation-only follow-ups do not
change this payload. No new Windows, hosted CI or real-MCP pass is claimed;
source-rights review and deferred replacements are unchanged.

### Owned panel-registration publication

Candidate `a01d95c82fb9bd6de3066532c1a23084d78c1e89` fixes missing plugin
`registered` notifications. Ownership and the default enabled state are now
available before the store publishes registration, allowing subscribers to
list their panel, update its badge and request open synchronously. The UI bridge
checks the live registry/configuration and layout availability so that an open
request from the first registration is not lost before React's next commit.
Foreign-plugin event filtering is retained.

Admission failures release newly reserved ownership/enabled state while
preserving pre-existing configured IDs. A store-publication failure retracts
the entry and refreshes the snapshot before propagating the original error;
a retry can register the same ID. Subscriber exceptions remain isolated.
The new source/installed regression checks exactly-once notification, callback
API use and actual controller open, foreign isolation, duplicate/invalid
admission, injected admission/publication failures, rollback and retry.

The Node 24.19.0 / pnpm 11.26.0 build passed. **152/152 local regression gates
passed** in **33.1 seconds** (10 workers). Staged-package verification passed
for **2,894 files and 32 entry targets**. The committed source inventory has
**3,091 entries** with no non-file/binary findings.

Archive SHA-256:
`88066401b107868d2fd1e67028e8b5a1d11b883a32aa8a7c10b5b5308293d827`.
Package content SHA-256:
`b48735a2a0a9980d2592a153bf1014147711350c46279823d0a47592afa1c034`.

The registration regression passed against source, compiled build, and the
fresh managed installed package. The exact archive passed clean macOS arm64
Node 24 setup/refresh/doctor, earlier renderer/deadline/selection probes,
quantum write-and-sync/preflight fixtures, seven scientific-helper tests, and
real PTY draft editing/clearing, provider routes, a local scripted Agent turn,
and normal exit. No host credentials or paid model endpoint were used.

Evidence is retained in the sibling `FlagQAI-opensource-audit-evidence`
directory, including `panel-registration-completion-audit.json`.
Documentation-only follow-ups do not change the tested package payload. No
engine, dependency or source-replacement migration is included. No new Windows,
hosted CI or real-MCP coverage is claimed; source-rights review remains open.

### Reentrant panel replacement and shared open limits

Candidate `3e5019fb9f0b7086b756e68e52f5e6fca5b1c614` fixes two further plugin-panel
issues. Disposal and failed-registration cleanup now remove ownership/enabled
state only when it still belongs to that registration. A synchronous
`unregistered` subscriber may replace the same ID without the old disposer
removing its replacement. Retiring records release quota while preserving
notification ownership, so replacement also works at the four-panel limit.
Store removal and bound cleanup finish even if a host observer throws.

Open throttling now uses a weakly keyed, activation-wide state and monotonic
time. All panels of the same live plugin activation share the five-second
window, including after every panel is removed and re-registered. A reservation
before consumer dispatch blocks synchronous callback reentry. No-consumer and
failed dispatch do not spend the window; separate activations remain independent.
The per-panel wall-clock timestamp was removed.

The Node 24.19.0 / pnpm 11.26.0 build passed. **153/153 local gates passed** in
**36.2 seconds** (10 workers). The new source/compiled regression covers
replacement state, quota, throwing observers, failed-publication replacement,
window boundaries, cross-panel/re-registration limits, independent activations,
callback reentry, and delivery retry. Staged-package verification passed for
**2,894 files and 32 entry targets**. The source inventory has **3,092 entries**
with no non-file/binary findings.

Archive SHA-256:
`98252a83558f5d173c7c53b07675e1d034f1af9c64817cfafed72b1120a115d3`.
Package content SHA-256:
`c2ea2235ce1857bd40d0efed9f42fe341eda48a659823930033b0dd3286e5c66`.

That exact archive passed clean macOS arm64 Node 24 setup/refresh/doctor and
the installed reentrancy/shared-window regression, together with the earlier
renderer/deadline/selection/registration probes. Quantum write-and-sync and
preflight fixtures, seven scientific-helper tests, and real PTY draft editing/
clearing, provider routes, a local scripted Agent turn and clean exit passed.
No host credentials or paid model endpoint were used.

Evidence is retained in the sibling `FlagQAI-opensource-audit-evidence`
directory, including `panel-reentrancy-completion-audit.json`.
Documentation-only follow-ups do not change this tested package payload. No
renderer, Yoga or dependency migration is included. Windows/hosted execution
and source replacements remain deferred; source-rights review remains open.
These results do not add real-provider or real-MCP coverage.

### Host panel removal notifications

Candidate `f72f254844f22ba1346cbdd0c67b2c6c7efa1690` fixes host subscribers losing plugin
`unregistered` events after the store deletes an entry. The store captures the
original event source before invoking callbacks and passes it internally to
observers; the host facade filters on that captured source. This also preserves
classification when an earlier observer synchronously reuses the ID for a
builtin or plugin replacement. The public event payload is unchanged, and the
host subscription capability remains degraded.

The shared source/compiled/installed regression covers deletion, subscribers
attached after registration, idempotent disposal, same-ID re-registration,
builtin filtering, ordinary plugin-service events, reentrant source changes,
publication rollback and unsubscribe. An older selection test now waits for the
committed bridge state before disposal; its exact lifecycle assertions remain.
The first full regression exposed that test timing issue; the final full run
passed **154/154 gates in 34.0 seconds** (10 workers).

The Node 24.19.0 / pnpm 11.26.0 build and staged-package verification passed:
**2,894 package files, 32 entry targets and 3,093 source entries**, with no
file-type findings. Archive SHA-256:
`67d562d6ed0ae9121631cacc27ffd90d4ca18109a0c57c2d9a3e6e02fae423d8`.
Package content SHA-256:
`1d5d163d0a7e7758acc116c60ae4c44c13f1496485cc18be7b08cc4b2dfc621e`.

The exact archive passed clean macOS arm64 Node 24 setup/refresh/doctor, all
installed panel/renderer/deadline probes, quantum fixture write-and-sync and
simulation/trainer preflight, seven scientific-helper tests, and real PTY
editing/clearing, provider routes, a local scripted Agent turn and clean exit.
The first installation attempt reached the panel probes but stopped at the
quantum disk-space guard; after generated scratch cleanup, the full clean
acceptance rerun passed. No host credentials or paid model endpoint were used.

Evidence is retained in the sibling `FlagQAI-opensource-audit-evidence`
directory, including `host-panel-events-completion-audit.json` and the initial
failure logs. Documentation-only follow-ups do not change the tested package
payload. Renderer, Yoga and dependencies are unchanged. Source replacements
remain deferred and source-rights review remains unresolved. No new Windows,
hosted CI, real-provider or real-MCP coverage is claimed.

### Malformed MCP preflight messages

Candidate `e691f574aedb4f6b63476d3f1054283a9f4d98d1` rejects null, scalar and array MCP
messages before response-ID lookup. A null JSON message previously raised an
uncaught TypeError in the stdout listener, bypassing the preflight rejection
path. Invalid envelopes now reject with a protocol error and reach the existing
child-stop cleanup, without claiming readiness. Regression inputs cover null,
boolean, number, string and array payloads from local child processes.

Source compilation, **21 preflight/route tests**, **155/155 full regression
gates (35.3 seconds)** and staged-package verification passed (**2,894 files,
32 entry targets**). Inventory recorded **3,093 source entries** and no file-type
findings. Archive SHA-256: `ae3a137422b0de272ab67e9181e723c602940162bdfcf5fef874d3af6b8dd6db`.
Package content SHA-256: `c55b32ec5c11af0a5ae4160e72a456c1853bbd699c4a4ab16630ebd302f0e912`.

A fresh isolated npm installation of that exact archive passed **15 preflight
tests** using local scripted MCP fixtures. This focused acceptance does not add
managed-profile or PTY evidence, real MCP/provider coverage, or Windows/hosted
CI coverage. Renderer, Yoga and dependencies are unchanged; source replacements
remain deferred and source-rights review remains unresolved. Evidence, including
the original crash and `quantum-envelope-completion-audit.json`, is retained in
the sibling `FlagQAI-opensource-audit-evidence` directory.

### Secret questionnaire answers in durable exports

Runtime fix `87c452a726c5b5823f16043a05ea83dd8427e108`, with final test candidate
`fc929bfd89f47a6d48be8ecc5efa7157abbb33e4`, prevents `/export` from writing marked-secret
questionnaire answers verbatim. The DSH export previously read raw durable
results instead of the UI's masked question record. It now matches secret
`ask_user_question` calls to modern and legacy result envelopes and reuses
question-record masking. Unparseable secret-bearing results are entirely masked;
ordinary answers, unrelated tool results and non-secret reuse of a call ID keep
their existing export behavior. The Harness log itself is unchanged.

The regression uses synthetic markers only and passed against source, compiled
code and the managed installed package. Source compilation, **156/156 local
gates (32.9 seconds)** and staged-package verification passed (**2,894 files,
32 entry targets**). Inventory found **3,094 source entries**, no file-type
findings. Archive SHA-256: `595a4d9c0c82f5efef06fd078011fc1171267024ddf9bc565b324f90c3972d50`.
Package content SHA-256: `f6a59ef2fc9c6ba7ebc829b28d19a407f3e027352e3fa566bdfba4e26940a72b`.

The fresh macOS arm64 installation first passed setup and existing installed
panel/renderer/deadline probes, then exposed an incomplete test bootstrap:
the export probe needed the same official Harness profile resolution used by
normal startup. After that correction, acceptance continued on the same exact
archive. A continuation-only `/private/var` versus `/var` store mismatch was
corrected, and the deliberately damaged refresh fixture was restored from the
archive before retry. Export masking, refresh/doctor, seven scientific-helper
tests and local permission-evidence assertions passed. This was a continued
acceptance, not an uninterrupted fresh rerun. Failure and final logs are retained
with `secret-export-completion-audit.json` in the sibling evidence directory.

No new PTY, real-provider, real-MCP, QPU, Windows or hosted-CI coverage is claimed.
Renderer, Yoga and dependencies are unchanged. Source replacements remain
deferred and source-rights review remains unresolved.

### Question cancellation lifetime and listener retention

Candidate `0e7ae8b46e28f2501f654176306464a8e5ec59b0` rejects already-aborted question
requests before they enter the queue or become visible. It preserves the
injected interruption type and `ASK_ABORTED` code. Normal UI completion, user
cancellation and bulk rejection now detach the ask's abort listener. Previously,
a live shared signal retained each settled question's pending state, including
its answers; a three-answer synthetic reproduction left three listeners.
The existing request-level response/cancel APIs keep their behavior.

The new source/compiled/installed regression verifies 100 consecutive answers
with zero retained listeners after each, pre-abort both idle and behind a live
ask, queued abort, user cancel, bulk rejection and request APIs. It is registered
in the local suite, CI and the future managed-install probe sequence.
Source compilation, **157/157 full gates (32.7 seconds)** and package verification
passed (**2,894 files / 32 entry targets**). Inventory recorded **3,095 source
entries** and no file-type findings. Archive SHA-256:
`eb5c6cf3963faad0a7b4595125f84f7659314e6445165e07ecb5432c8b63456e`.
Package content SHA-256:
`a0f6f4d6faf49d61076d0f2c68df246bb898ffa70a1db6c1f152f820d3cdeb50`.

A fresh isolated npm installation of that exact archive passed the shared
QuestionStore regression with synthetic inputs. This focused acceptance does
not add managed-profile, PTY, real-provider/MCP/QPU, Windows or long-duration
evidence. Evidence and the reproduction are retained with
`question-lifetime-completion-audit.json` in the sibling evidence directory.
Renderer, Yoga and dependencies are unchanged; source replacements remain
deferred and source-rights review remains unresolved.

### Scientific worker diagnostic redaction at the output limit

Candidate `3daa3b179472c713fb6f92b5b9dee153d213ea4f` redacts complete
worker stderr before applying the existing 2,000-character error-message limit.
Previously, a credential crossing that boundary was truncated before its full
environment value could be matched, exposing its prefix. Only synthetic values
were used to reproduce and verify this issue.

The regression fails on the previous implementation and passes with complete,
repeated and boundary-crossing values at five offsets. Ordinary diagnostics and
the output limit remain covered. Source compilation, **158/158 full gates
(32.5 seconds)**, staged package verification (**2,894 files / 32 entry targets**)
and a fresh isolated npm installation of the exact archive passed. The probe is
registered in CI, the local suite and future managed-install verification.
Inventory recorded **3,096 source entries** and zero file-type findings.
Archive SHA-256:
`7cf23eea38bc7a100a554aaf83262f4959879d4d90b6984d1b1c69802d1b0b6f`.
Package content SHA-256:
`2c68d6d3d194a968bef4da77e16acc19d423e030b07ed88236bafe4f3c0b03e9`.

This is local Node worker-fixture evidence; it adds no real scientific runtime,
provider/MCP/QPU, managed-profile, PTY, Windows or endurance coverage. Evidence
is retained in the sibling audit directory as
`science-redaction-completion-audit.json`. Renderer, Yoga and dependencies are
unchanged. Source-rights #86/#93 and deferred release infrastructure remain open.

### Background-job cache eviction and session reset

Candidate `83922b960870f07b8bc158256389354093297b5a` releases kernel output
read state when terminal jobs are evicted from the bounded history. Previously,
the visible list stayed at 40 while evicted cursors and partial-line buffers
remained retained. Reset now clears pre-registration commands as well as jobs
and read state, including when no visible job exists. This prevents an old
session's command from being applied to a reused job ID. An empty reset still
emits no visible-change notification; running jobs remain exempt from trimming.

The regression checks 200 terminal jobs with partial output, retained and
removed cursors, populated/empty reset, stale command isolation, normal
registration races and 45 simultaneous live jobs. It fails with the previous
cursor-eviction behavior and passes against source, compiled code and a fresh
isolated npm installation. Source compilation, **159/159 full gates (32.1
seconds)** and staged package verification (**2,894 files / 32 entry targets**)
passed. Inventory recorded **3,097 source entries** and zero file-type findings.
Archive SHA-256:
`6a3e519ba490328bfcdbd82ea812c88b30d0934005fa2f547bbdf12600459f64`.
Package content SHA-256:
`dfca2526ab8bde673b0fabc95bdb3a5c161e7d283435440531717c175c19098b`.

The regression is registered in the local suite, CI and future managed-install
probes. This is synthetic store evidence, with no new real Harness job,
managed-profile, PTY, provider/MCP/QPU, Windows or endurance coverage. Evidence
is retained in the sibling directory as `jobs-cache-completion-audit.json`.
Renderer, Yoga and dependencies remain unchanged; source-rights #86/#93 and
deferred release infrastructure remain open.

### Exhaustive background-job subscription cleanup

Candidate `5428d06a1428a623c9c8b009b0e8ee33fe664a42` attempts every job-service
unsubscriber even when an earlier one throws. Detach revokes the attachment
before cleanup, releases the Channel owner entry even after failures, then
rethrows the original error or aggregates multiple errors. Previously, a
throwing event-bus unsubscriber prevented the changed/done subscriptions from
being released. The callback fence already blocked stale writes; this fix
ensures external subscription resources are also released.

The regression fails with the old fail-fast detach and passes against source,
compiled code and a fresh isolated npm installation. It covers owner/service
teardown, zero/single/multiple failures, exact-once cleanup attempts, owner
entry removal, stale callbacks and idempotence. Source compilation,
**160/160 full gates (33.5 seconds)** and staged package verification
(**2,894 files / 32 entry targets**) passed. Inventory recorded **3,098 source
entries** and zero file-type findings. Archive SHA-256:
`1822eaad9768c712eddfdf0f10c9c14b72192824eb2853d622e0f1448904f9e6`.
Package content SHA-256:
`e9914b636ba6618e8fd4d8de94b83d98e903ce61dd32264f0a3f16ca7a687d9e`.

The test is registered in the local suite, CI and future managed-install
probes. Evidence uses synthetic service callbacks and adds no real Harness job,
managed-profile, PTY, provider/MCP/QPU, Windows or endurance coverage. Logs and
hashes are retained as `jobs-detach-completion-audit.json` in the sibling audit
directory. Renderer, Yoga and dependencies remain unchanged; source-rights
#86/#93 and deferred release infrastructure remain open.

### Alternate Harness installed-profile acceptance

For an explicitly installed Harness host, the opt-in
`verify-quantum-task.mjs --fresh-profile-install` probe now packs the current
CLI and installs that archive with the official `dsh plugin --profile flagqai
add -w` command into a disposable profile. Set
`FLAGQAI_ACCEPTANCE_RUNTIME_MANIFEST` to the host runtime's `package.json` and
`FLAGQAI_ACCEPTANCE_UPSTREAM_VERSION` to its expected version. The regular
`--clean-install` path still tests the managed 0.2.0 pin; this alternate mode
does not change the product's setup pin. Do not hand-build the profile with
`npm install`: Harness 0.2.1 requires its installer-owned root Include for
provider configuration reloads.

On macOS arm64, the 0.2.1-rc.2 alternate host passed a fresh plugin-profile
installation, provider persistence, Bell simulation/OpenQASM, session
restart/resume, the six-tool H2 research preflight, and a real pinned
FlagQuantum MCP one-step VQE call. The VQE runner independently checked the
150-step result against the two-qubit electronic reference (absolute error
`1.8784060973331407e-9` Ha; variance `3.0662423711191877e-9`). Model
responses came from a local scripted fixture. This proves neither a paid-model
workflow nor Windows support, and does not yet change the managed install pin.

## Final export procedure

1. Resolve the current-source rights and public dependency gates.
2. Apply any remaining fixes, freeze the candidate, and record its exact commit,
   tree, staged file list, package content hash, dependency inventory, and tests.
3. Review what documentation, test data, and notices accompany that snapshot.
4. Choose the target-history strategy explicitly; run the corresponding import
   verification before adding a public remote or uploading source.
5. Import only the approved snapshot. Keep the original private object history
   private. Set up target CI/settings and verify the exported checkout.
6. Treat npm publication and native executable distribution as separate release
   decisions with their own acceptance and dependency checks.

No public source push, history rewrite, visibility change, npm publication,
issue closure, or modification of organization billing/settings was performed.
Any code-review branch remains in the existing private source repository.
