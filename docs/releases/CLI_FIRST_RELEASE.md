# CLI first open-source release

Updated **2026-10-29 (Asia/Shanghai)**. The current product is a native CLI
and local service development preview. DeepSeek Harness remains authoritative
for Agent execution, tools, approvals and durable sessions. Web and Desktop
are separate product decisions.

## Current baseline

[PR #1](https://github.com/flagos-ai/FlagQAI/pull/1) merged the Windows/CI fixes.
Its exact source candidate passed Ubuntu Node 22/24, macOS Node 24 and Windows
Node 24. The [acceptance status](ACCEPTANCE_STATUS.md) records the commit/tree,
job links, platform-specific coverage, tarball hashes and remaining limits.
Do not treat that baseline as evidence for an untested later artifact.

Public source is already available in `flagos-ai/FlagQAI`. The package remains
`@flagqai/cli@0.1.0`, with `private: true`, and is not published to npm.
No standalone GitHub Release is recorded in the current status snapshot.
Local source builds and staged tarballs are the preview installation paths.

The [earlier checklist and acceptance notes](https://github.com/flagos-ai/FlagQAI/blob/1ec6918493bcd86fc3336586a35301a5633eabbb/docs/releases/CLI_FIRST_RELEASE.md)
retain the private-candidate history, old import plans and earlier local
results. They do not supersede the current hosted evidence or authorize a new
release. Do not rewrite repository history as part of release preparation.

<a id="release-boundary"></a>

## Repository and runtime boundary

[FlagQuantum](https://github.com/flagos-ai/FlagQuantum) develops the quantum
framework; FlagQAI integrates selected capabilities through the pinned
`flagquantum-mcp-server==0.3.2` interface. The [architecture](../ARCHITECTURE.md#relationship-to-flagquantum)
identifies ownership and the cross-repository verification boundary. An engine
feature or upstream `main` change is not a FlagQAI support claim.

Retain applicable dsh-TUI MIT, dsh-std and other dependency notices, and the
FlagQAI Apache-2.0 notice. Current package checks establish the distribution
file boundary and notice presence; they do not decide unresolved source rights.

<a id="remaining-release-gates"></a>

## Gates for the next distributable candidate

1. **Freeze and identify the artifact.** Record the exact source commit/tree,
   staged tarball SHA-256, package content hash and dependency inventory. Use
   the actual built package, not an older same-version preview. Platform
   archives may have different hashes; compare inventory content hashes before
   claiming equivalent extracted contents.
2. **Run candidate-specific checks.** Run focused checks for the change,
   compile, verify the staged package, and execute the hosted matrix. For
   runtime/package changes, require clean installed acceptance on each claimed
   platform. Keep Linux arm64 source-build evidence separate from hosted x64
   results and retain its pin-specific toolchain requirement.
3. **Exercise the user workflow.** Preserve provider discovery/retry and secret
   redaction, setup/refresh/doctor, PTY draft editing, one scripted Agent turn,
   normal exit, session restart/resume, approval and cancellation evidence.
   The workflow's platform conditions determine which job covers each scenario.
   Live provider requests need separate authorization.
4. **Bound scientific claims.** Record the MCP and resolved engine versions,
   tool inputs/outputs and observed session events. For numerical claims,
   record the independent reference, units, tolerance and result. Current
   acceptance covers local simulation and bounded two-qubit VQE, not general
   molecular electronic structure, live QPUs or all FlagQuantum backends.
5. **Resolve the Windows permission policy.** The tested configuration still
   selects `danger-full-access` and approval `never`. Functional Windows
   acceptance is complete for the recorded baseline; sandbox confinement and
   safer defaults remain separate decisions and tests. Do not describe the
   current Windows composition as sandbox-confined.
6. **Record source/dependency dispositions.** Reconcile the unresolved items
   in the [source review](OPEN_SOURCE_READINESS.md), preserve applicable
   licenses/notices, and review the exact source and installed dependencies.
   The [registry inventory](REGISTRY_DEPENDENCY_LICENSES.md) describes the
   additional native-artifact review needed for a bundled installed tree or
   standalone executable. Historical private-tracker issue numbers are not
   public-repository issue status.
7. **Approve distribution separately.** Decide the version, supported platform
   claims, release notes and delivery channel. Keep `private: true` until an
   explicitly approved npm release change. After publication, test the actual
   registry artifact; local tarball acceptance does not prove registry delivery.
   Review standalone bundling and updater policy separately before publishing
   native executables. Verify maintainer access, branch protection and the
   private vulnerability-reporting contact for launch.

## Verification entry points

From the repository root, with the documented Node/pnpm/uv toolchain:

```sh
pnpm --dir apps/cli install --frozen-lockfile
pnpm --dir apps/cli run compile
pnpm --dir apps/cli run verify:package
node apps/cli/scripts/verify-guide.mjs
node docs/releases/release-file-inventory.mjs --out /tmp/flagqai-release-file-inventory.json
```

For installed Harness interactions with controlled fixtures:

```sh
node apps/cli/scripts/verify-quantum-task.mjs --clean-install --interactions
node apps/cli/scripts/verify-quantum-task.mjs --clean-install --gateway --interactions
```

For pinned real-MCP numerical acceptance with scripted model responses:

```sh
node apps/cli/scripts/verify-quantum-task.mjs --clean-install --real-mcp --vqe --research-vqe --interactions
```

The full installed first-run PTY recipe, driver preparation and environment
flags are maintained in [the CI workflow](../../.github/workflows/ci.yml).
It runs on Ubuntu Node 22, macOS Node 24 and Windows Node 24; Ubuntu Node 24
runs source/package checks without that clean-installed PTY path. Preserve
these distinctions in acceptance reports.

Neither this checklist nor its verification commands publishes npm packages,
changes repository visibility, closes historical review items or proves
Windows confinement. Consult [SECURITY.md](../../SECURITY.md) for the current
runtime and reporting boundary.
