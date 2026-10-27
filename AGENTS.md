# Repository work rules

Keep the first release centered on the native CLI. Do not add Web or Desktop
implementations to this repository without an explicit product decision.
DeepSeek Harness remains authoritative for Agent execution, sessions, tools,
permissions and persistence; the CLI and local service are adapters and clients.

Preserve the imported dsh-TUI and dsh-std copyright and license notices. Do
not import portrait/animation assets until redistribution rights are verified.
Never commit credentials, generated `apps/cli/lib`, package archives or installed
dependencies. Use English for new code, docs, issues and PRs. Keep commits on
`feat/` branches authored and committed as FlagQuantum
<liuwei.chem.phys@gmail.com>.

After source edits, run focused tests, the staged package verification and a
clean installed-package acceptance when relevant. Do not publish npm packages,
change repository visibility or make paid model calls as part of verification.
