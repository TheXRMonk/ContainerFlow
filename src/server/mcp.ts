import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawn, type ChildProcess } from "child_process";
import { discoverServices, discoverConnections, getContainerLogs } from "./docker";
import { pollStats } from "./watcher";
import { loadFlows, getFlows, getSettings, addFlow, updateFlow, deleteFlow } from "./flows";
import type { Flow } from "../shared/types";

// ── Init ──
loadFlows();

// ── Dashboard process state ──
let dashboardProc: ChildProcess | null = null;

const server = new McpServer({
  name: "dockerflow",
  version: "0.1.0",
});

// ── Flow tools ──

server.tool("list_flows", "List configured flows and particle settings from flows.yaml", {}, async () => {
  return {
    content: [{ type: "text", text: JSON.stringify({ flows: getFlows(), settings: getSettings() }, null, 2) }],
  };
});

server.tool(
  "create_flow",
  "Create a new flow in flows.yaml",
  {
    id: z.string().describe("Unique flow identifier"),
    name: z.string().describe("Display name"),
    color: z.string().describe("Hex color (e.g. #22d3ee)"),
    speed: z.number().describe("Animation speed multiplier"),
    path: z.array(z.string()).describe("Ordered list of service names the flow traverses"),
    description: z.string().optional().describe("Optional description"),
  },
  async ({ id, name, color, speed, path, description }) => {
    try {
      const flow: Flow = { id, name, color, speed, path, ...(description ? { description } : {}) };
      addFlow(flow);
      return { content: [{ type: "text", text: `Flow "${id}" created successfully.` }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  },
);

server.tool(
  "update_flow",
  "Update an existing flow in flows.yaml",
  {
    id: z.string().describe("Flow identifier to update"),
    name: z.string().optional().describe("New display name"),
    color: z.string().optional().describe("New hex color"),
    speed: z.number().optional().describe("New speed multiplier"),
    path: z.array(z.string()).optional().describe("New path"),
    description: z.string().optional().describe("New description"),
  },
  async ({ id, ...fields }) => {
    try {
      const partial: Partial<Omit<Flow, "id">> = {};
      if (fields.name !== undefined) partial.name = fields.name;
      if (fields.color !== undefined) partial.color = fields.color;
      if (fields.speed !== undefined) partial.speed = fields.speed;
      if (fields.path !== undefined) partial.path = fields.path;
      if (fields.description !== undefined) partial.description = fields.description;
      const updated = updateFlow(id, partial);
      return { content: [{ type: "text", text: JSON.stringify(updated, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  },
);

server.tool(
  "delete_flow",
  "Delete a flow from flows.yaml",
  { id: z.string().describe("Flow identifier to delete") },
  async ({ id }) => {
    try {
      deleteFlow(id);
      return { content: [{ type: "text", text: `Flow "${id}" deleted.` }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  },
);

server.tool(
  "simulate_flow",
  "Trigger a flow simulation on connected browser clients (requires the web server to be running)",
  { flowId: z.string().describe("Flow identifier to simulate") },
  async ({ flowId }) => {
    const flow = getFlows().find((f) => f.id === flowId);
    if (!flow) {
      return { content: [{ type: "text", text: `Error: Flow "${flowId}" not found.` }], isError: true };
    }
    // The MCP server runs as a separate process — it cannot directly broadcast to WebSocket clients.
    // Return the flow data so the caller knows the simulation details.
    return {
      content: [{
        type: "text",
        text: `Flow "${flowId}" found. To trigger the animation, send a WebSocket message to the running DockerFlow server:\n${JSON.stringify({ type: "simulate_flow", flowId }, null, 2)}\n\nFlow details:\n${JSON.stringify(flow, null, 2)}`,
      }],
    };
  },
);

// ── Docker monitoring tools ──

server.tool(
  "list_services",
  "List Docker services with state, image, ports, and networks",
  { project: z.string().optional().describe("Filter by Docker Compose project name") },
  async ({ project }) => {
    try {
      const projects = project ? [project] : [];
      const all = !project;
      const services = await discoverServices(all, projects);
      return { content: [{ type: "text", text: JSON.stringify(services, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error discovering services: ${err.message}` }], isError: true };
    }
  },
);

server.tool(
  "get_stats",
  "Get CPU and memory stats for running Docker services",
  { service: z.string().optional().describe("Filter by service uid (project/name)") },
  async ({ service }) => {
    try {
      const services = await discoverServices(true, []);
      const stats = await pollStats(services);
      const filtered = service ? stats.filter((s) => s.service === service) : stats;
      return { content: [{ type: "text", text: JSON.stringify(filtered, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error getting stats: ${err.message}` }], isError: true };
    }
  },
);

server.tool(
  "get_logs",
  "Get recent log lines from a Docker container",
  {
    container_id: z.string().describe("Container ID (short or full)"),
    tail: z.number().optional().default(50).describe("Number of lines to retrieve (default 50)"),
  },
  async ({ container_id, tail }) => {
    try {
      const lines = await getContainerLogs(container_id, tail);
      const text = lines.map((l) => `[${l.stream}] ${l.timestamp} ${l.line}`).join("\n");
      return { content: [{ type: "text", text: text || "(no logs)" }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error fetching logs: ${err.message}` }], isError: true };
    }
  },
);

server.tool(
  "get_connections",
  "Get detected connections between Docker services",
  {},
  async () => {
    try {
      const services = await discoverServices(true, []);
      const connections = await discoverConnections(services);
      return { content: [{ type: "text", text: JSON.stringify(connections, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error discovering connections: ${err.message}` }], isError: true };
    }
  },
);

// ── Dashboard tools (dev) ──

server.tool(
  "start_dashboard",
  "Start the DockerFlow dev server (Vite + backend with hot reload). Only for development.",
  { mode: z.enum(["dev", "preview"]).optional().default("dev").describe("'dev' = hot reload, 'preview' = build + serve") },
  async ({ mode }) => {
    if (dashboardProc && !dashboardProc.killed) {
      return { content: [{ type: "text", text: "Dashboard is already running. Use stop_dashboard first." }], isError: true };
    }
    try {
      const args = mode === "preview" ? ["run", "preview"] : ["run", "dev"];
      dashboardProc = spawn("bun", args, {
        cwd: process.cwd(),
        stdio: "ignore",
        detached: false,
      });
      const url = mode === "preview" ? "http://localhost:9470" : "http://localhost:5173";
      return { content: [{ type: "text", text: `Dashboard started in ${mode} mode (PID ${dashboardProc.pid}).\nOpen ${url}` }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error starting dashboard: ${err.message}` }], isError: true };
    }
  },
);

server.tool(
  "stop_dashboard",
  "Stop the running DockerFlow dev server",
  {},
  async () => {
    if (!dashboardProc || dashboardProc.killed) {
      return { content: [{ type: "text", text: "Dashboard is not running." }], isError: true };
    }
    const pid = dashboardProc.pid;
    dashboardProc.kill();
    dashboardProc = null;
    return { content: [{ type: "text", text: `Dashboard stopped (PID ${pid}).` }] };
  },
);

// ── Start ──
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("DockerFlow MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
