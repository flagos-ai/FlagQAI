# Headless source import boundary

This is a technical dependency reduction for source provenance issue #93 (recorded in the maintainers' issue tracker). It does **not** clear the rights of any source file or authorize a public release.

The local Harness service starts from `apps/cli/src/dsh-adapter/server-host.ts`. Previously its source import graph reached the embedded terminal implementation through `channel/sanitize.ts` and through the Claude/Codex backend installers' imports of the terminal updater. Its session-view initializer also loaded splash-font and activity-frame modules that the headless service never renders. Those paths made the service depend on the disputed presentation tree even when the interactive TUI plugin was disabled.

This batch moves profile and CLI-manifest reads into small non-rendering utilities, changes the shared channel sanitizer to the pinned `string-width` package, and separates display-setting validation from the font and activity data. The existing updater and presentation modules retain their exported contracts. `verify:headless-source-boundary` walks static imports, literal dynamic imports, and dynamic imports through local constant string paths from the headless host. It traverses 259 CLI source modules and 34 workspace package modules without reaching `src/ink`, `src/components`, `src/screens` or `src/ui.ts`. The scanner maps the compiled `flagqai-platform` paths back to their `packages/` sources, follows their relative imports, and rejects unknown dynamic expressions. Three reviewed external dynamic imports remain explicit exceptions: optional sharp resolution, the installed pi-ai provider catalog, and the optional Claude SDK. Installed runtime resolution, non-relative package imports and any source loaded by those external modules require separate review.

The ordinary `flagqai` entry still starts the inherited TUI, and the private CLI package still includes its source and compiled modules. The opt-in `--ink` client is not a completed default-TUI replacement. The remaining source families, package payload, private history, Windows installation, and hosted CI must be resolved under the [replacement plan](SOURCE_REPLACEMENT_PLAN.md) and [release review](OPEN_SOURCE_READINESS.md). This import check is a guard against reintroducing presentation dependencies into the headless service, not evidence of independent origin.

An isolated installed-package probe exposed a separate startup path outside that source import graph. Three profile rows (`flagqai-panels`, `flagqai-plugin-host`, and `working-activity`) loaded terminal presentation modules during `flagqai serve`, even though the server does not render them. Removing the compiled presentation directories from a temporary package caused those rows to fail at startup. Disabling the three rows in the temporary profile allowed the same stripped package to start and answer `/v1/health`. The committed profile now disables them only when `FLAGQAI_SERVER_MODE=1`; the ordinary TUI keeps them enabled. The local-server bundle check evaluates both profile modes to guard that boundary. This initial probe covered server startup and health, not an Agent task from the stripped package or the rights of remaining files.

The deeper no-provider acceptance is:

```sh
node apps/cli/scripts/verify-quantum-task.mjs --clean-install --without-presentation
```

This builds a temporary package, removes only the inherited compiled `lib/types/ink`, `components`, `screens`, and `ui` presentation paths, then performs a fresh npm installation with managed Harness in an isolated HOME. The scripted model and deterministic MCP fixture exercise the service's real Agent/session path without a paid model request or QPU. The normal package and default TUI remain intact. A passing run proves only the tested headless task path; it does not clear the remaining package source, private history, or broader interactive TUI rights.

The runtime-import check alone did not cover TypeScript's type graph. An
isolated compile of `src/dsh-adapter/server-host.ts` initially emitted 915
modules, including 115 under `src/ink`, because the headless channel's scene
descriptor reached `scenes.ts` and its `typeof import('../ui.js')` prop type.
The scene registry now stores an erased component signature and a renderer-free
UI prop type; the public `src/scenes.ts` facade retains the complete typed UI
kit for plugin authors. A separate contract compilation checks that a public
scene descriptor still registers through Cordis. The optional `session/title`
event augmentation is separate from the renderer's JSX augmentation.

`verify:headless-type-boundary` compiles the headless host alone into a
temporary output directory and checks its emitted paths. On the reviewed tree
it emits 775 JavaScript modules, with no `ink`, `components`, `screens`, `ui`,
`theme`, `hooks/useBlink`, or any of the 57 historical candidates at their old
paths. The two remaining component type edges were moved to their owning
backend and display ports; the legacy kernel catalog continues to re-export
`KernelStatus` for terminal consumers. An isolated compile also passed after
physically removing those presentation paths from a disposable checkout,
using the existing installed dependencies and generated declarations. This is
a compiler/source boundary for one entry point, not a complete clean-source
build: the ordinary package
still compiles and contains the inherited TUI, the public scene facade still
types against it, and renamed counterparts or other rights remain in scope.
