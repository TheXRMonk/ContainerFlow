import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import path from "path";
import fs from "fs";
import { discoverServices, discoverConnections, getContainerLogs, streamContainerLogs } from "./docker";
import { pollStats, watchDockerEvents } from "./watcher";
import { loadFlows, getFlows, getSettings } from "./flows";
import type { WSMessage } from "../shared/types";

const app = new Hono();

// ── CORS ──
app.use("/api/*", cors());

// ── CLI args ──
const args = process.argv.slice(2);
const ALL = args.includes("--all");
const projectsFlag = args.find((a) => a.startsWith("--projects="));
const PROJECTS = projectsFlag
  ? projectsFlag.split("=")[1]!.split(",")
  : ALL
    ? []
    : [path.basename(process.cwd())];

// ── Config ──
const PORT = parseInt(process.env.PORT || "9470");
const AUTH_TOKEN = process.env.AUTH_TOKEN || "";
const HOST = AUTH_TOKEN ? "0.0.0.0" : "127.0.0.1";
const POLL_INTERVAL_MS = 5000;
const WS_RECONNECT_MS = 3000;

// ── Auth middleware ──
if (AUTH_TOKEN) {
  app.use("*", async (c, next) => {
    // Skip static assets and auth page
    if (c.req.path === "/" || c.req.path.startsWith("/assets") || c.req.path.endsWith(".png") || c.req.path.endsWith(".ico")) return next();
    if (c.req.path === "/api/auth") return next();

    const token = c.req.header("Authorization")?.replace("Bearer ", "");
    if (token !== AUTH_TOKEN) return c.json({ error: "Unauthorized" }, 401);
    return next();
  });
}

// ── API ──
app.get("/api/services", async (c) => {
  const services = await discoverServices(ALL, PROJECTS);
  return c.json(services);
});

app.get("/api/connections", async (c) => {
  const services = await discoverServices(ALL, PROJECTS);
  const connections = await discoverConnections(services);
  return c.json(connections);
});

app.get("/api/health", (c) => c.json({ ok: true, mode: ALL ? "all" : "filtered", projects: PROJECTS }));

// ── Flows ──
loadFlows();

app.get("/api/flows", (c) => {
  return c.json({ flows: getFlows(), settings: getSettings() });
});

app.get("/api/logs/:id", async (c) => {
  const id = c.req.param("id");
  if (!/^[a-f0-9]{12,64}$/.test(id)) {
    return c.json({ error: "Invalid container ID" }, 400);
  }
  const tail = Math.min(Math.max(parseInt(c.req.query("tail") || "200") || 200, 1), 5000);
  try {
    const lines = await getContainerLogs(id, tail);
    return c.json(lines);
  } catch (err) {
    return c.json({ error: "Failed to fetch logs" }, 500);
  }
});

// ── Node positions (persisted to file) ──
const POSITIONS_FILE = path.join(process.cwd(), ".dockerflow-positions.json");

app.get("/api/positions", (c) => {
  try {
    if (fs.existsSync(POSITIONS_FILE)) {
      const data = JSON.parse(fs.readFileSync(POSITIONS_FILE, "utf-8"));
      return c.json(data);
    }
  } catch (err) {
    console.error("Failed to read positions file:", err);
  }
  return c.json({});
});

app.put("/api/positions", async (c) => {
  try {
    const body = await c.req.json();
    fs.writeFileSync(POSITIONS_FILE, JSON.stringify(body, null, 2));
    return c.json({ ok: true });
  } catch {
    return c.json({ error: "Failed to save" }, 500);
  }
});

// ── Serve frontend build ──
app.use("/*", serveStatic({ root: "./dist" }));
app.get("/*", serveStatic({ root: "./dist", path: "index.html" }));

// ── WebSocket ──
const clients = new Set<WebSocket>();
const authenticatedClients = new Set<WebSocket>();
const logStreams = new Map<WebSocket, { destroy: () => void }>();

function isAuthenticated(ws: WebSocket): boolean {
  return !AUTH_TOKEN || authenticatedClients.has(ws);
}

function broadcast(msg: WSMessage) {
  const data = JSON.stringify(msg);
  for (const ws of clients) {
    if (!isAuthenticated(ws)) continue;
    try {
      ws.send(data);
    } catch {}
  }
}

function cleanupLogStream(ws: WebSocket) {
  const stream = logStreams.get(ws);
  if (stream) {
    logStreams.delete(ws);
    try {
      stream.destroy();
    } catch (err) {
      console.error("Failed to destroy log stream:", err);
    }
  }
}

// ── Docker events ──
async function refreshServices() {
  try {
    const services = await discoverServices(ALL, PROJECTS);
    const connections = await discoverConnections(services);
    const stats = await pollStats(services);

    const svcHash = services.map((s) => `${s.uid}:${s.state}`).join("|");
    if (svcHash !== lastServicesHash) {
      lastServicesHash = svcHash;
      broadcast({ type: "services", data: services });
    }

    const connHash = connections.map((c) => `${c.from}:${c.to}`).join("|");
    if (connHash !== lastConnectionsHash) {
      lastConnectionsHash = connHash;
      broadcast({ type: "connections", data: connections });
    }

    broadcast({ type: "stats", data: stats });
  } catch (err) {
    console.error("Refresh error:", err);
  }
}

// Quick refresh — services + connections, no stats (fast)
async function quickRefresh() {
  try {
    const services = await discoverServices(ALL, PROJECTS);
    const svcHash = services.map((s) => `${s.uid}:${s.state}`).join("|");
    if (svcHash !== lastServicesHash) {
      lastServicesHash = svcHash;
      broadcast({ type: "services", data: services });

      // Also refresh connections when services change
      const connections = await discoverConnections(services);
      const connHash = connections.map((c) => `${c.from}:${c.to}`).join("|");
      if (connHash !== lastConnectionsHash) {
        lastConnectionsHash = connHash;
        broadcast({ type: "connections", data: connections });
      }
    }
  } catch {}
}

// Debounced refresh for Docker events
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  clearTimeout(retryTimer);
  // First check at 1.5s, retry at 3.5s to catch stragglers (e.g. slow destroy)
  refreshTimer = setTimeout(() => {
    quickRefresh();
    retryTimer = setTimeout(quickRefresh, 2000);
  }, 1500);
}

watchDockerEvents((event) => {
  broadcast({ type: "docker_event", data: event });
  scheduleRefresh();
});

// ── Stats polling ──
let lastServicesHash = "";
let lastConnectionsHash = "";

setInterval(refreshServices, POLL_INTERVAL_MS);

// ── Start ──
const server = Bun.serve({
  hostname: HOST,
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade (auth handled via first message)
    if (url.pathname === "/ws") {
      if (server.upgrade(req)) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    return app.fetch(req, server);
  },
  websocket: {
    open(ws) {
      const native = ws as unknown as WebSocket;
      clients.add(native);

      if (!AUTH_TOKEN) {
        // No auth required — send data immediately
        const flowsData = { flows: getFlows(), settings: getSettings() };
        if (flowsData.flows.length > 0) {
          try { native.send(JSON.stringify({ type: "flows", data: flowsData })); } catch {}
        }
        // Send current services/connections/stats
        discoverServices(ALL, PROJECTS).then(async (services) => {
          const connections = await discoverConnections(services);
          const stats = await pollStats(services);
          try {
            native.send(JSON.stringify({ type: "services", data: services }));
            native.send(JSON.stringify({ type: "connections", data: connections }));
            native.send(JSON.stringify({ type: "stats", data: stats }));
          } catch {}
        }).catch(() => {});
      }
    },
    close(ws) {
      const native = ws as unknown as WebSocket;
      cleanupLogStream(native);
      clients.delete(native);
      authenticatedClients.delete(native);
    },
    message(ws, message) {
      try {
        const msg = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message as ArrayBuffer));
        const native = ws as unknown as WebSocket;

        // Handle authentication via first message
        if (msg.type === "auth") {
          if (msg.token === AUTH_TOKEN) {
            authenticatedClients.add(native);
            native.send(JSON.stringify({ type: "auth_ok" }));
            // Send initial data after auth
            const flowsData = { flows: getFlows(), settings: getSettings() };
            if (flowsData.flows.length > 0) {
              native.send(JSON.stringify({ type: "flows", data: flowsData }));
            }
            // Send current services/connections/stats immediately
            discoverServices(ALL, PROJECTS).then(async (services) => {
              const connections = await discoverConnections(services);
              const stats = await pollStats(services);
              try {
                native.send(JSON.stringify({ type: "services", data: services }));
                native.send(JSON.stringify({ type: "connections", data: connections }));
                native.send(JSON.stringify({ type: "stats", data: stats }));
              } catch {}
            }).catch(() => {});
          } else {
            native.send(JSON.stringify({ type: "auth_error" }));
            native.close();
          }
          return;
        }

        // Reject messages from unauthenticated clients
        if (!isAuthenticated(native)) return;

        if (msg.type === "subscribe_logs" && msg.container) {
          cleanupLogStream(native);

          const stream = streamContainerLogs(msg.container, (line) => {
            try {
              native.send(JSON.stringify({ type: "log_line", data: line }));
            } catch {}
          });
          logStreams.set(native, stream);
        } else if (msg.type === "unsubscribe_logs") {
          cleanupLogStream(native);
        } else if (msg.type === "simulate_flow" && msg.flowId) {
          const flow = getFlows().find((f) => f.id === msg.flowId);
          if (flow) {
            broadcast({
              type: "particle_spawn",
              data: { flowId: flow.id, color: flow.color, speed: flow.speed, path: flow.path },
            });
          }
        }
      } catch (err) {
        console.error("Failed to handle WS message:", err);
      }
    },
  },
});

const mode = ALL ? "all projects" : `project(s): ${PROJECTS.join(", ")}`;
console.log(`\n  Flowteon`);
console.log(`  → http://${HOST}:${PORT}`);
console.log(`  → Mode: ${mode}`);
console.log(`  → Auth: ${AUTH_TOKEN ? "enabled" : "disabled (localhost only)"}\n`);
