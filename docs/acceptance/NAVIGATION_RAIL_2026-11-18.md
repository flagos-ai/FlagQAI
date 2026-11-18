# Compact navigation rail acceptance

The existing navigation labels, routes, Agent toggle and manual pane sizing are
unchanged. Original line drawings now share one stroke style. The rail uses
compact rounded rows and a restrained active marker. Short viewports scroll the
rail so lower actions remain reachable. The current route has `aria-current`;
Agent expansion remains independently represented by `aria-expanded`.

Validation: TypeScript, formatting, production build and staged CLI package
verification passed (2671 files, 32 entry targets). One isolated browser scenario
passed at 1440x900, 1024x600 and 800x400: keyboard route changes, current-route
identity, the guide disclosure and chat/editor draft preservation through reload.
The 800x400 screenshot was visually inspected. No paid model calls or live
service restarts were performed.
