import { startHarnessHost } from "../harness-adapter/index.mjs";
import { createEmptyBackendRegistry, createFlagQaiServer } from "./index.mjs";

const valueAfter = (args, name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};

export async function runStandaloneServer(args = process.argv.slice(2), options = {}) {
  const host = valueAfter(args, "--host") ?? "127.0.0.1";
  const rawPort = valueAfter(args, "--port") ?? "4096";
  const port = Number(rawPort);
  const serverOptions = {
    hostname: host,
    port,
    registry: options.registry ?? createEmptyBackendRegistry(),
    backendHost: options.backendHost,
    onError: options.onError ?? ((error) => console.error(error)),
  };
  const mounted = options.composeHarness ? await startHarnessHost({
    compose: options.composeHarness,
    createServer: createFlagQaiServer,
    serverOptions: { hostname: host, port, onError: serverOptions.onError },
    startHeartbeat: options.startHeartbeat,
    onError: serverOptions.onError,
  }) : undefined;
  const server = mounted?.server ?? createFlagQaiServer(serverOptions);
  const address = mounted?.address ?? await server.listen();
  const displayHost = typeof address === "object" && address !== null ? address.address : host;
  const displayPort = typeof address === "object" && address !== null ? address.port : port;
  console.log(`FlagQAI local service listening on http://${displayHost}:${displayPort}`);
  if (!mounted && server.address() && (options.registry?.ids.length ?? 0) === 0) {
    console.log("No agent backend is mounted yet; health, OpenAPI, and backend discovery are available.");
  }

  let stopping;
  const stop = () => stopping ??= (async () => {
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    if (mounted) await mounted.close();
    else await server.close();
    options.onClose?.();
  })();
  const onSignal = () => { void stop().catch(serverOptions.onError); };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  return { ...server, close: stop };
}
