# Security reporting

FlagQAI is a development preview with no published stable CLI release.
Security fixes currently target the development branch; no maintained release
series or response-time guarantee is established yet.

## Report privately

Do not post exploit details, credentials, or private session transcripts in a
public issue. If GitHub private vulnerability reporting is enabled, use
[Report a vulnerability](https://github.com/flagos-ai/FlagQAI/security/advisories/new).
If it is unavailable, contact the maintainer at
[liuwei.chem.phys@gmail.com](mailto:liuwei.chem.phys@gmail.com).

Include the commit or package version, operating system, relevant backend,
reproduction steps, expected and observed behavior, and likely impact.
Use minimal synthetic examples and redact model keys, prompts, file contents,
session identifiers, and personal paths from logs.

## Runtime boundary

FlagQAI delegates tools, permissions, and durable session state to its Harness
backend. The terminal does not provide a separate sandbox. Review the selected
backend's permissions before running tools. The local service binds to
loopback by default; exposing it outside the machine requires a separate
deployment and authentication review.

The current Windows composition is not verified as sandbox-confined. Consult
the [release checklist](docs/releases/CLI_FIRST_RELEASE.md) for platform gates.
