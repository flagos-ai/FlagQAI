# FlagQAI in the VS Code integrated terminal

The current distribution is the native FlagQAI CLI. This repository does not
ship a FlagQAI VS Code extension. Use the integrated terminal to run the same
CLI package and Harness profile used in a standalone terminal.

## Start a session

Install the locally built preview tarball, then initialize its runtime:

```sh
npm install -g /path/to/flagqai-cli-0.1.0.tgz --omit=peer
flagqai setup
flagqai
```

Open the terminal in the intended workspace before launching. Configure a
provider through `/setup` and `/provider`. `flagqai --resume` resumes the last
session, and `flagqai --resume <id>` selects a recorded session.

## Configuration

The commands are `flagqai` and `fq`; the native profile is `flagqai`.
Preferences and CLI history use `~/.flagqai`. The managed runtime defaults to
`~/.flagqai/cli`; `FLAGQAI_CLI_RUNTIME_ROOT` selects a different runtime root.
An explicit `DSH_HOME` selects the underlying Harness home. Previous product
commands, `DSH_TUI_*` variables and `~/.dsh-tui` configuration are not read or
migrated. Reconfigure the new profile explicitly.

For English UI, start with `FLAGQAI_LANG=en flagqai` on POSIX shells, or set
`$env:FLAGQAI_LANG='en'` before running `flagqai` in PowerShell. Set `VISUAL` or
`EDITOR` to a working local editor command when using an external-editor flow.

## Terminal checks

Use `flagqai doctor` for local runtime and launcher diagnostics. If raster
images do not display correctly, `FLAGQAI_IMAGE_PROTOCOL=none` disables the
terminal graphics path while retaining text output. Terminal image support
must be tested in the actual terminal host; it is not supplied by this repo
as an editor extension.

See [Getting Started](getting-started.en.md) for the complete installation and
provider workflow, and [Configuration](configuration.en.md) for settings.
