# FlagQAI product naming

Decision recorded on **2026-10-17 (Asia/Shanghai)**. The maintainer requested
unified product names without compatibility for the previous commands,
environment variables or configuration. This is a naming/configuration change;
the deferred renderer/source replacements remain deferred.

| Surface | Current name |
| --- | --- |
| Product | FlagQAI |
| Published-package identity (still private preview) | `@flagqai/cli` |
| Commands | `flagqai`, `fq` |
| Native launcher implementation | `bin/native-launcher.js` |
| Windows source launcher | `flagqai.cmd` |
| Product environment variables | `FLAGQAI_*` |
| Preferences and CLI history | `~/.flagqai` |
| Managed runtime | `~/.flagqai/cli`, configurable with `FLAGQAI_CLI_RUNTIME_ROOT` |
| Native Harness profile | `flagqai` |
| Rescue profile | `flagqai-safe` |
| Product-owned plugin IDs and configuration keys | `flagqai` / `flagqai-*` |
| Bundled guide | `flagqai-guide` |
| Local MathJax wrapper | `@flagqai-vendor/mathjax-tex-svg` |
| Local development SQLite island | `@flagqai-dev/sqlite-island` |

There are no `dsh-tui` / `dst` executable aliases, `DSH_TUI_*` variable
fallbacks, old profile selection, or reads/migration from `~/.dsh-tui`.
Configure a new installation through `flagqai setup`, then `/setup`.
Do not delete an existing user's old directory as part of installation.
An explicit `DSH_HOME` still selects the real Harness home; its selected
product profile is now `flagqai`.

DeepSeek Harness's real `dsh` command, `DSH_HOME` and other `DSH_*` service
variables, `@deepseek-ai/*` packages, the separately maintained `dsh-std`
packages, and the `tui.dsh/v1alpha1` protocol coordinate retain their actual
identities. Renaming those would change independent dependencies/contracts.
The original licenses, copyright, pinned source records, imported protocol
fixtures, and historical external-adapter note likewise retain their upstream
names. The product guide no longer presents an upstream companion extension
or ecosystem project as a published FlagQAI extension, marketplace or package.

## Verification scope

The identity regression includes isolated checks proving that an old data
directory is not read or copied, an old installed profile does not satisfy
new-profile readiness, and only the new language variable controls launcher
help. Staged-package verification checks the command set and rejects the old
launcher and guide alias. Full CLI regression, build and installed acceptance
results are recorded in the readiness report for this candidate.

Naming does not change source authorship or resolve #86/#93. Keep the original
MIT and other applicable notices; source replacement and release authorization
remain separate decisions.
