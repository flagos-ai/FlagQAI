# Contributing to FlagQAI

FlagQAI currently focuses on the CLI, its Harness adapter, the local service,
and scientific and quantum workflows. The optional React quantum workbench is
source-only and separately built in `apps/web`; it is not included in the CLI
release artifact. Desktop remains outside this release's scope.

## Development

Use Node.js 24+ and pnpm 11.26.0. From the repository root:

```sh
pnpm --dir apps/cli install --frozen-lockfile
pnpm --dir apps/cli run compile
pnpm --dir apps/cli run tui
```

See the [README](README.md) for installed-package setup and provider
configuration. Use a `feat/` branch and write new code, documentation, issues,
and pull requests in English. Keep credentials and local experiment output
out of commits.

## Verify a change

Run the focused checks for the behavior you change. The staged package check
is required when changing source, packaging, dependencies, or bundled material:

```sh
pnpm --dir apps/cli run verify:package
node apps/cli/scripts/verify-guide.mjs
```

For broad CLI changes, run the build regression suite:

```sh
pnpm --dir apps/cli run verify:build
```

For installation or runtime changes, also run isolated installed-package
acceptance with the scripted model:

```sh
node apps/cli/scripts/verify-quantum-task.mjs --clean-install --interactions
```

This acceptance downloads dependencies and uses temporary local state. It
does not require a paid model request. Real-provider tests must be explicitly
authorized and must not use credentials from unrelated profiles.

The installed guide is generated from `apps/cli/docs/`. After editing a
bundled chapter or its link renderer, regenerate and verify it:

```sh
node apps/cli/scripts/build-guide.mjs
node apps/cli/scripts/verify-guide.mjs
```

## Pull requests

Describe the problem, resulting behavior, exact verification performed, and
known limitations. For scientific changes, state the model or Hamiltonian,
units, reference result, and acceptance tolerance where relevant. Distinguish
a scripted fixture from a live model run and local simulation from hardware.

Harness remains authoritative for agent execution, sessions, tools,
permissions, and persistence. Changes must preserve this boundary. Retain
upstream copyright notices and record the origin, version, and license of
new dependencies, copied code, test data, and artwork. A license at the
repository root does not establish rights to imported material.

See the [release checklist](docs/releases/CLI_FIRST_RELEASE.md) and
[readiness report](docs/releases/OPEN_SOURCE_READINESS.md) before preparing a
public source export. Report suspected vulnerabilities using
[SECURITY.md](SECURITY.md).
