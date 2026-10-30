// Opt-in loopback fault injection for the scripted development fixture only.
// Never imported by the Web bundle, production host or Agent runtime.
import { createServer, request as forward } from "node:http";
export async function recoveryProxy(port, upstream, statistics) {
  let offline = false,
    dropNextReceipt = false;
  const sockets = new Set();
  const server = createServer(async (req, res) => {
    if (req.url === "/__fixture/network") {
      if (req.method === "POST") {
        let body = "";
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 1024) {
            res.writeHead(413).end();
            return;
          }
        }
        try {
          const input = JSON.parse(body);
          offline = input.offline === true;
          dropNextReceipt = input.dropNextReceipt === true;
        } catch {
          res.writeHead(400).end();
          return;
        }
      }
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ offline, dropNextReceipt, ...statistics() }));
      if (offline)
        for (const socket of sockets)
          if (socket !== req.socket) socket.destroy();
      return;
    }
    if (offline) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: {
            code: "fixture_offline",
            message: "Scripted network outage",
          },
        }),
      );
      return;
    }
    if (
      dropNextReceipt &&
      req.method === "POST" &&
      req.url.endsWith("/messages")
    ) {
      // The backend will receive this POST, but neither its receipt nor live
      // events reach the browser. It must recover history without resubmission.
      offline = true;
      for (const socket of sockets) if (socket !== req.socket) socket.destroy();
    }
    const outgoing = forward(
      {
        hostname: "127.0.0.1",
        port: upstream,
        method: req.method,
        path: req.url,
        headers: req.headers,
      },
      (incoming) => {
        if (
          dropNextReceipt &&
          req.method === "POST" &&
          req.url.endsWith("/messages") &&
          incoming.statusCode === 202
        ) {
          dropNextReceipt = false;
          incoming.resume();
          incoming.on("end", () => res.destroy());
        } else {
          res.writeHead(incoming.statusCode, incoming.headers);
          incoming.pipe(res);
        }
      },
    );
    outgoing.on("error", () => res.destroy());
    res.on("close", () => outgoing.destroy());
    req.pipe(outgoing);
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  return {
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
