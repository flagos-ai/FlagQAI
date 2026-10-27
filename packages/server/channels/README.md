# Message Channel Configuration Application

`cc-connect.mjs` owns the project's CC Connect configuration, private management
token generation, bounded authenticated loopback status probe and exact managed
launcher migration. Browser settings and setup/status/launch scripts use the
same application. CC Connect supplies external message-platform connectors;
Harness ACP owns Agent execution, model routing, approvals and persistence.

```text
Host settings route / source scripts
  -> Server channel configuration application
     -> .flagqai/cc-connect/config.toml (private token/configuration)
     -> authenticated 127.0.0.1 management status
     -> native Harness ACP profile entrypoint
```

The canonical module is unchanged from its original implementation. Configuration
creation is exclusive, existing user edits are preserved, and only an exact
managed legacy launcher is upgraded under the Harness file lock with a private
recovery copy. Status exposes channel types and readiness, never platform
credentials or the management token. Quick-setup arguments remain restricted to
the existing supported platform names. Readiness is not evidence that an
external platform can deliver a message.

The source entrypoints retain process lifetime/signal forwarding. They do not
move into the application or get duplicated in a renderer. Setup/status commands
are not permission to send a message; platform credentials and actual messaging
remain separate user-authorized actions. No new connector is enabled by migration.

Historical `src/channels/cc-connect.mjs` imports re-export this application.
Run `tests/cc-connect-integration.test.mjs` and native Host route regressions;
they cover real isolated ACP/management startup without sending a platform message.
