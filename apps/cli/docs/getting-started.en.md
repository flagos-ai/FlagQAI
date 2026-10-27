# FlagQAI CLI: Getting Started

[Documentation index](README.md) · [简体中文](getting-started.md)

FlagQAI CLI is currently available from this source checkout and a locally
built tarball; `@flagqai/cli` has not been published to npm. Do not run an npm
registry install for this package yet.

## Build and install a local package

Use Node.js 22.19 or Node.js 24+, pnpm 11, and npm. From the repository root:

```sh
pnpm --dir apps/cli install --frozen-lockfile
pnpm --dir apps/cli run compile
node apps/cli/scripts/pack-flagqai.mjs --out /tmp/flagqai-packages
npm install -g /tmp/flagqai-packages/flagqai-cli-0.1.0.tgz --omit=peer
flagqai setup
flagqai
```

The packer builds a staged package with its workspace dependencies and license
notices. It does not publish to npm. `flagqai setup` downloads pinned Harness
and pnpm dependencies into `~/.flagqai/cli` and creates the compatible
`flagqai` profile. A separate global `dsh` installation is not needed for this
managed path. An internet connection is required for the dependencies.

## Task files and sandbox modes

Start FlagQAI from the directory where the agent should work. It does not
create a separate directory, container, or Git worktree for each task: files
such as `.flagqai/h2-vqe` are ordinary files in the current workspace. The
default Harness session mode on macOS and Linux is `workspace-write`: the
Harness shell and filesystem tools use the launch directory and permitted
temporary areas as their writable roots.
The plan mode is read-only; full-access mode removes that confinement. Use
`/permission status` to inspect the effective policy, and `Shift+Tab` to
cycle the built-in modes. A permission escalation requires approval unless
the session is already in full-access mode.

The current Windows CLI composition defaults to `danger-full-access` with
approval policy `never`, because its sandbox backend has not been verified.
Do not rely on workspace-write confinement on Windows. This is tracked in
[the Windows release gate](../../../docs/releases/CLI_FIRST_RELEASE.md#remaining-release-gates).
The sandbox is same-host file-access confinement, not an isolated VM or
container; processes still share the host environment.

For a source development run, use `pnpm --dir apps/cli run tui` after the source
build. This path follows the repository's existing development profile setup;
the locally installed tarball uses `flagqai setup` instead.

## Configure a provider

On first launch, `/setup` shows local provider and credential status. It does
not contact a model endpoint. Choose **Configure provider** to open
`/provider`. Select an official route or an API-compatible gateway; a custom
gateway needs its protocol, base URL, API key, and model ID. Verify connectivity
before starting a task. Keys remain in the native credential store. A failed
check can be corrected in `/provider` without rebuilding the package.

`flagqai doctor` checks the local runtime and managed FlagQuantum MCP installation;
its output does not prove that a live provider works. Never commit a real API
key. Install uv before `flagqai setup`; setup installs the pinned MCP and Python
environment. Normal CLI startup runs the installed MCP directly.

## Commands and compatibility

| Command | Purpose |
| --- | --- |
| `flagqai setup` | Prepare the managed local Harness runtime and profile |
| `flagqai` | Start the interactive terminal client |
| `flagqai doctor` | Check local runtime readiness |
| `flagqai safe` | Diagnose a broken profile and offer a rescue workflow |
| `flagqai serve` | Start the local headless service |
| `flagqai attach <url>` | Attach a terminal to a running local service |
| `flagqai --help` | Show the complete command list |

`fq` is the short command. The native profile is `flagqai`; preferences
and CLI history use `~/.flagqai`, and product environment variables use
`FLAGQAI_*`. Old product commands and configuration are not read or migrated.
An explicit `DSH_HOME` selects the Harness home containing the new profile.

This unpublished preview cannot self-update from npm. Install a newer local
tarball and run `flagqai setup --refresh`. Run `flagqai setup` before launching
the installed preview.

For keyboard controls, sessions, safe mode, and other inherited terminal features,
see the [user guide](user-guide.en.md). For source provenance and release
limits, see the [CLI release checklist](../../../docs/releases/CLI_FIRST_RELEASE.md).
