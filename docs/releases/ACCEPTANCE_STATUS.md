# Release and acceptance status

Snapshot: **2026-10-29 (Asia/Shanghai)**. FlagQAI is a source-available
**0.1.0 development preview**, not a published stable CLI release.

## Source and hosted evidence

[PR #1](https://github.com/flagos-ai/FlagQAI/pull/1) passed all four jobs in
[hosted run 40743996111](https://github.com/flagos-ai/FlagQAI/actions/runs/40743996111)
at commit `16c08001d024918cefd2411cf3a4ea7a71ce5456`. It was merged as
`1ec6918493bcd86fc3336586a35301a5633eabbb`; both commits have Git tree
`ce0fe8ebfdadd8c50dca2dd0374d427da03acae1`. The merge triggered a separate
[main run](https://github.com/flagos-ai/FlagQAI/actions/runs/40806745104).
The table records the completed PR run, not an assumed result for that main
run or any later commit. New candidates need their own CI evidence.

| Hosted job | Observed result | Acceptance scope |
| --- | --- | --- |
| [Ubuntu, Node 22](https://github.com/flagos-ai/FlagQAI/actions/runs/40743996111/job/123012812598) | Passed; installed probe reports Linux x64, Node 22.23.4 | Source/package checks; clean installed CLI, setup/refresh/doctor, PTY provider configuration, draft editing, scripted Agent turn and normal exit; scientific helper and permission-event evidence; installed Harness approval/cancellation/resume and Bell workflows, including an Anthropic-compatible fixture gateway. |
| [Ubuntu, Node 24](https://github.com/flagos-ai/FlagQAI/actions/runs/40743996111/job/123012812526) | Passed | Source, staged-package and regression checks. This job does not run the clean installed-package PTY/Agent acceptance. |
| [macOS, Node 24](https://github.com/flagos-ai/FlagQAI/actions/runs/40743996111/job/123012812145) | Passed; installed probe reports Darwin arm64, Node 24.22.1 | Source/package checks and clean installed PTY/Agent acceptance; real pinned MCP Bell, trainer VQE and bounded research VQE checks, with scripted model responses and installed Harness interactions. |
| [Windows, Node 24](https://github.com/flagos-ai/FlagQAI/actions/runs/40743996111/job/123012812629) | Passed; installed probe reports Windows x64, Node 24.22.1 | Source/package checks; clean setup/refresh/doctor, real pinned MCP simulation/trainer prewarm, scientific helper and permission-event evidence, ConPTY provider configuration, draft editing, scripted Agent turn and normal exit. |

The workflow is [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).
Its platform conditions are part of the coverage boundary: a green matrix
does not mean every job ran every installed or scientific scenario.

The installed first-run logs identify these input tarballs:

| Installed acceptance platform | Tarball SHA-256 |
| --- | --- |
| Linux x64 Node 22 and macOS arm64 Node 24 | `289866de2fa27a9908ecd91885e569c137ea8b6174ca25d29ec9c589fa9247e1` |
| Windows x64 Node 24 | `4da99760e66d847c329222ac1d7c5ca1ef70bfd8cca9bc1ce40324fe8872f766` |

Archive hashes are platform-specific evidence; they do not assert identical
extracted package contents. CI uploads `release-file-inventory-*` reports for
source/package inventory and content-hash review. A later documentation or
runtime change produces a new candidate and needs a new package inventory.

## What these passes establish

The hosted matrix now executes and the tested Windows installed CLI can
configure a provider, persist its settings, edit a draft, complete a local
scripted-model turn and exit normally. The Windows test driver also releases
its ConPTY worker after observing the CLI's zero exit code.

All model requests in this acceptance use controlled local fixtures. Real MCP
execution and independent numerical checks are limited to the scenarios named
above. Readiness, observed tool execution and numerical validation remain
separate evidence; none is a general scientific-validity verdict.

The matrix does **not** establish live model-provider connectivity, live QPU
execution, GPU/distributed performance, every terminal/OS combination, or
Windows sandbox confinement. Linux arm64 is outside this hosted matrix; its
older source-build acceptance and compiler requirement are recorded in the
[Linux arm64 recipe](LINUX_ARM64_ACCEPTANCE.md), not inferred from Ubuntu x64.

## Publication and remaining decisions

- Public source exists in `flagos-ai/FlagQAI`. The earlier private-candidate
  billing failures and proposed source-import procedures are historical records.
- `@flagqai/cli` remains version `0.1.0` with `private: true`. On this snapshot
  date the public npm registry returned 404 for that package and this repository
  had no published GitHub Releases. Build and install a local staged tarball;
  this status update does not publish a package or standalone executable.
- Windows still defaults to `danger-full-access` with approval policy `never`
  in [`cordis.patch.yml`](../../apps/cli/cordis.patch.yml). Functional acceptance
  does not establish confinement or change those defaults. A permission-policy
  change and its verification remain separate work.
- The [source/provenance review](OPEN_SOURCE_READINESS.md) contains unresolved
  review items. CI success records no new source-rights disposition. Historical
  issue numbers in those audit records refer to the maintainers' earlier
  tracker, not necessarily issues in this public repository.
- Before a distributable release, freeze its exact source and artifact, review
  the source/dependency dispositions and inventory, verify the chosen platform
  claims, and explicitly approve the version and distribution channel. Follow
  the [current release checklist](CLI_FIRST_RELEASE.md).

## Relationship to FlagQuantum

[FlagQuantum](https://github.com/flagos-ai/FlagQuantum) is the separate
Python/PyTorch quantum-computing framework. FlagQAI supplies the user-facing
CLI, local service, integration and evidence presentation. DeepSeek Harness
owns Agent execution, tools, permissions and durable sessions.

FlagQAI currently installs `flagquantum-mcp-server==0.3.2` under managed
Python 3.12, then invokes quantum capabilities through MCP. It does not check
out FlagQuantum `main` during setup. FlagQuantum's broader backend, training
and hardware capabilities are not automatically exposed or verified by this
pinned integration. See the [architecture and repository ownership boundary](../ARCHITECTURE.md#relationship-to-flagquantum).
