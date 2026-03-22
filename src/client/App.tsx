import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  SmoothStepEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type EdgeProps,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Wifi, WifiOff, ChevronDown, Check, Lock, LogOut, Eye, EyeOff, Terminal, Database, Zap, Radio, Globe } from "lucide-react";

import { ServiceNode } from "./nodes/ServiceNode";
import { GroupNode } from "./nodes/GroupNode";
import { useDocker } from "./hooks/useDocker";
import { buildLayout, computeEdges } from "./engine/layout";
import { ParticleEngine } from "./engine/particles";
import { ParticleOverlay } from "./components/ParticleOverlay";
import { LogPanel } from "./panels/LogPanel";
import { FlowPanel } from "./panels/FlowPanel";
import type { Service, Flow } from "../shared/types";

function OffsetEdge(props: EdgeProps) {
  const offset = (props.data as any)?.offset ?? 0;
  return <SmoothStepEdge {...props} pathOptions={{ offset, borderRadius: 8 }} />;
}

const nodeTypes = { service: ServiceNode, group: GroupNode };
const edgeTypes = { offsetSmooth: OffsetEdge };

function loadFilter(): Set<string> {
  try {
    const raw = localStorage.getItem("df:filter");
    if (raw) return new Set(JSON.parse(raw));
  } catch {}
  return new Set();
}

function getToken(): string {
  return localStorage.getItem("df:token") || "";
}

function LoginScreen({ onAuth }: { onAuth: (token: string) => void }) {
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);

  const hackerLog = (lines: string[], onDone: () => void) => {
    lines.forEach((line, i) => {
      setTimeout(() => {
        setLogLines((prev) => [...prev, line]);
        if (i === lines.length - 1) setTimeout(onDone, 400);
      }, i * 180);
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (connecting) return;
    setConnecting(true);
    setError("");
    setLogLines([]);

    hackerLog([
      "$ dockerflow connect --auth",
      "> Establishing secure connection...",
      "> Validating AUTH_TOKEN...",
    ], async () => {
      try {
        const res = await fetch("/api/health", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          hackerLog([
            "> Token accepted",
            "> Loading Docker socket...",
            "> Connection established!",
          ], () => {
            localStorage.setItem("df:token", token);
            setConnected(true);
            setTimeout(() => onAuth(token), 800);
          });
        } else {
          hackerLog(["> ERROR: Invalid token", "> Connection refused"], () => {
            setError("Token invalido");
            setConnecting(false);
          });
        }
      } catch {
        hackerLog(["> ERROR: Connection failed"], () => {
          setError("No se pudo conectar");
          setConnecting(false);
        });
      }
    });
  };

  return (
    <div className={`h-screen w-screen bg-slate-950 flex items-center justify-center transition-opacity duration-700 ${connected ? "opacity-0" : "opacity-100"}`}>
      <div className="flex flex-col items-center gap-6 w-80">
        {/* Logo + Title */}
        <img
          src="/alteonx-logo.png"
          alt="Alteonx"
          className={`w-16 h-16 transition-all duration-700 ${connected ? "scale-110" : ""}`}
          style={{ filter: "brightness(0) saturate(100%) invert(45%) sepia(85%) saturate(2000%) hue-rotate(200deg) brightness(1.1)" }}
        />
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white tracking-wide">DockerFlow</h1>
          <span className="text-xs text-cyan-400 tracking-widest uppercase">AlteonX</span>
        </div>

        {/* Form */}
        <form onSubmit={submit} className={`flex flex-col gap-3 w-full transition-opacity duration-300 ${connecting ? "opacity-50 pointer-events-none" : ""}`}>
          <div className="relative">
            <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type={showToken ? "text" : "password"}
              value={token}
              onChange={(e) => { setToken(e.target.value); setError(""); }}
              placeholder="AUTH_TOKEN"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-10 py-2.5 text-sm text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 transition-colors"
              autoFocus
              disabled={connecting}
            />
            <button
              type="button"
              onClick={() => setShowToken((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
            >
              {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          {error && <span className="text-red-400 text-xs font-mono">{error}</span>}
          <button
            type="submit"
            disabled={connecting || !token}
            className={`w-full flex items-center justify-center gap-2 text-sm font-medium py-2.5 rounded-lg transition-all duration-300 ${
              connecting
                ? "bg-slate-800 text-slate-500 cursor-wait"
                : "bg-cyan-600 hover:bg-cyan-500 text-white hover:shadow-lg hover:shadow-cyan-500/20"
            }`}
          >
            <Terminal size={14} />
            {connecting ? "Connecting..." : "Connect"}
          </button>
        </form>

        {/* Terminal log */}
        {logLines.length > 0 && (
          <div className="w-full bg-slate-900/80 border border-slate-800 rounded-lg p-3 font-mono text-[11px] space-y-0.5 max-h-32 overflow-y-auto">
            {logLines.map((line, i) => (
              <div
                key={i}
                className={`${
                  line.includes("ERROR") ? "text-red-400" :
                  line.includes("accepted") || line.includes("established") ? "text-emerald-400" :
                  line.startsWith("$") ? "text-cyan-400" : "text-slate-400"
                } animate-[fadeIn_0.15s_ease-out]`}
              >
                {line}
                {i === logLines.length - 1 && !connected && (
                  <span className="inline-block w-1.5 h-3 bg-cyan-400 ml-1 animate-pulse" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState<boolean | null>(null);

  // Check if auth is required
  useEffect(() => {
    fetch("/api/health").then((r) => {
      if (r.ok) {
        setNeedsAuth(false);
        setAuthToken("");
      } else if (r.status === 401) {
        const saved = getToken();
        if (saved) {
          fetch("/api/health", { headers: { Authorization: `Bearer ${saved}` } }).then((r2) => {
            if (r2.ok) { setAuthToken(saved); setNeedsAuth(false); }
            else { localStorage.removeItem("df:token"); setNeedsAuth(true); }
          });
        } else {
          setNeedsAuth(true);
        }
      }
    }).catch(() => setNeedsAuth(false));
  }, []);

  if (needsAuth === null) return <div className="h-screen w-screen bg-slate-950" />;
  if (needsAuth) return <LoginScreen onAuth={(t) => { setAuthToken(t); setNeedsAuth(false); }} />;

  return <Dashboard token={authToken || ""} />;
}

function Dashboard({ token }: { token: string }) {
  const { services, connections, stats, statsVersion, events, connected, logLines, sendMessage, clearLogLines, flows, flowSettings, onParticleSpawn } = useDocker(token);
  const engineRef = useRef<ParticleEngine>(null);
  if (!engineRef.current) {
    engineRef.current = new ParticleEngine();
  }
  const engine = engineRef.current;
  engine.maxParticles = flowSettings.max_particles;
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const initialLayoutDone = useRef(false);
  const savedPositions = useRef<Record<string, { x: number; y: number }>>({});
  const [hiddenProjects, setHiddenProjects] = useState<Set<string>>(loadFilter);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [logPanelService, setLogPanelService] = useState<Service | null>(null);
  const reactFlowRef = useRef<any>(null);

  // Fit view when log panel opens/closes so graph adjusts to available space
  useEffect(() => {
    if (reactFlowRef.current) {
      // Small delay to let the DOM resize first
      setTimeout(() => {
        reactFlowRef.current?.fitView({ padding: 0.3, duration: 300 });
      }, 50);
    }
  }, [logPanelService]);

  // Load saved positions from server on mount
  useEffect(() => {
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    fetch("/api/positions", { headers })
      .then((r) => r.json())
      .then((data) => { savedPositions.current = data || {}; })
      .catch(() => {});
  }, [token]);

  // Save positions to server (debounced)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const savePositions = useCallback((nodes: Node[]) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const positions: Record<string, { x: number; y: number }> = {};
      for (const n of nodes) {
        positions[n.id] = { x: n.position.x, y: n.position.y };
      }
      savedPositions.current = positions;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      fetch("/api/positions", {
        method: "PUT",
        headers,
        body: JSON.stringify(positions),
      }).catch(() => {});
    }, 500);
  }, [token]);

  // Resize groups and clamp child positions
  const NODE_W = 240;
  const NODE_H = 160;
  const G_PAD = 28;
  const G_HEADER = 44;
  const MIN_X = G_PAD;
  const MIN_Y = G_HEADER + G_PAD;

  const handleNodesChange = useCallback((changes: NodeChange<Node>[]) => {
    onNodesChange(changes);

    const hasPositionChange = changes.some((c) => c.type === "position");
    if (!hasPositionChange) return;

    const isDragEnd = changes.some((c) => c.type === "position" && (c as any).dragging === false);

    setNodes((prev) => {
      let changed = false;
      let nodes = [...prev];

      // 1. Clamp Y only (prevent going above header), allow X freely
      nodes = nodes.map((n) => {
        if (!n.parentId) return n;
        const clampedY = Math.max(MIN_Y, n.position.y);
        if (clampedY !== n.position.y) {
          changed = true;
          return { ...n, position: { x: n.position.x, y: clampedY } };
        }
        return n;
      });

      // 2. For each group, keep leftmost child at MIN_X — shift group + children to match
      const groupIds = [...new Set(nodes.filter((n) => n.parentId).map((n) => n.parentId!))];
      for (const gid of groupIds) {
        const kids = nodes.filter((n) => n.parentId === gid);
        const minChildX = Math.min(...kids.map((k) => k.position.x));
        if (minChildX !== MIN_X) {
          const shift = minChildX - MIN_X; // positive = children too far right, negative = too far left
          changed = true;
          nodes = nodes.map((n) => {
            if (n.id === gid) return { ...n, position: { x: n.position.x + shift, y: n.position.y } };
            if (n.parentId === gid) return { ...n, position: { x: n.position.x - shift, y: n.position.y } };
            return n;
          });
        }
      }

      // 3. Resize groups to fit children (grows AND shrinks)
      nodes = nodes.map((n) => {
        if (!n.id.startsWith("group-")) return n;
        const kids = nodes.filter((c) => c.parentId === n.id);
        if (kids.length === 0) return n;

        let maxRight = 0;
        let maxBottom = 0;
        for (const k of kids) {
          maxRight = Math.max(maxRight, k.position.x + NODE_W + G_PAD);
          maxBottom = Math.max(maxBottom, k.position.y + NODE_H + G_PAD);
        }

        const minW = NODE_W + G_PAD * 3;
        const newW = Math.max(maxRight, minW);
        const newH = Math.max(maxBottom, MIN_Y + NODE_H + G_PAD);

        const curW = (n.style?.width as number) || 0;
        const curH = (n.style?.height as number) || 0;

        if (newW !== curW || newH !== curH) {
          changed = true;
          return { ...n, style: { ...n.style, width: newW, height: newH } };
        }
        return n;
      });

      if (isDragEnd) savePositions(nodes);
      return changed ? nodes : prev;
    });
  }, [onNodesChange, setNodes, savePositions]);

  const projects = useMemo(() => [...new Set(services.map((s) => s.project))].sort(), [services]);

  const toggleProject = (p: string) => {
    setHiddenProjects((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      localStorage.setItem("df:filter", JSON.stringify([...next]));
      return next;
    });
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as HTMLElement)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filteredServices = useMemo(
    () => services.filter((s) => !hiddenProjects.has(s.project)),
    [services, hiddenProjects]
  );

  const filteredConnections = useMemo(
    () => {
      const uids = new Set(filteredServices.map((s) => s.uid));
      return connections.filter((c) => uids.has(c.from) && uids.has(c.to));
    },
    [connections, filteredServices]
  );

  // Build layout when data changes
  useEffect(() => {
    if (filteredServices.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const { nodes: newNodes } = buildLayout(filteredServices, filteredConnections, stats);

    if (!initialLayoutDone.current) {
      // Apply saved positions to all nodes (groups + services)
      let positioned = newNodes.map((n) => {
        const saved = savedPositions.current[n.id];
        if (saved) return { ...n, position: saved };
        return n;
      });
      // Recalculate group sizes based on actual child positions
      positioned = positioned.map((n) => {
        if (n.type !== "group") return n;
        const kids = positioned.filter((c) => c.parentId === n.id);
        if (kids.length === 0) return n;
        let maxRight = 0;
        let maxBottom = 0;
        for (const k of kids) {
          maxRight = Math.max(maxRight, k.position.x + NODE_W + G_PAD);
          maxBottom = Math.max(maxBottom, k.position.y + NODE_H + G_PAD);
        }
        const minW = NODE_W + G_PAD * 3;
        const newW = Math.max(maxRight, minW);
        const newH = Math.max(maxBottom, MIN_Y + NODE_H + G_PAD);
        return { ...n, style: { ...n.style, width: newW, height: newH } };
      });
      // Compute edges + activeHandles based on positioned nodes
      const { edges, activeHandles } = computeEdges(positioned, filteredConnections);
      for (const n of positioned) {
        if (n.type === "service") {
          (n.data as any).activeHandles = activeHandles.get(n.id) || [];
        }
      }
      setNodes(positioned);
      setEdges(edges);
      initialLayoutDone.current = true;
    } else {
      setNodes((prev) => {
        // Keep existing nodes, update data only
        const updated = prev.map((n) => {
          const u = newNodes.find((nn) => nn.id === n.id);
          if (!u) return null;
          return { ...n, data: u.data };
        }).filter(Boolean) as Node[];

        const existingIds = new Set(updated.map((n) => n.id));
        const brand = newNodes.filter((n) => !existingIds.has(n.id));

        if (brand.length === 0) return updated;

        // Apply saved positions to brand-new nodes (e.g. re-enabled project filter)
        const hasSaved = brand.some((n) => savedPositions.current[n.id]);
        if (hasSaved) {
          let positioned = brand.map((n) => {
            const saved = savedPositions.current[n.id];
            if (saved) return { ...n, position: saved };
            return n;
          });
          // Recalculate group sizes for restored nodes
          positioned = positioned.map((n) => {
            if (n.type !== "group") return n;
            const kids = [...updated, ...positioned].filter((c) => c.parentId === n.id);
            if (kids.length === 0) return n;
            let maxRight = 0;
            let maxBottom = 0;
            for (const k of kids) {
              maxRight = Math.max(maxRight, k.position.x + NODE_W + G_PAD);
              maxBottom = Math.max(maxBottom, k.position.y + NODE_H + G_PAD);
            }
            const minW = NODE_W + G_PAD * 3;
            const newW = Math.max(maxRight, minW);
            const newH = Math.max(maxBottom, MIN_Y + NODE_H + G_PAD);
            return { ...n, style: { ...n.style, width: newW, height: newH } };
          });
          return [...updated, ...positioned];
        }

        // Find rightmost edge of existing groups to place new ones after
        let maxRightX = 0;
        for (const n of updated) {
          if (n.type === "group") {
            const w = (n.style?.width as number) || NODE_W + G_PAD * 3;
            maxRightX = Math.max(maxRightX, n.position.x + w);
          }
        }

        // Offset new groups so they appear to the right
        const newGroups = brand.filter((n) => n.type === "group");
        const offsetX = maxRightX > 0 ? maxRightX + 50 - (newGroups[0]?.position.x || 0) : 0;

        const positioned = brand.map((n) => {
          if (n.type === "group" && offsetX > 0) {
            return { ...n, position: { x: n.position.x + offsetX, y: n.position.y } };
          }
          return n;
        });

        return [...updated, ...positioned];
      });
    }
  }, [filteredServices, filteredConnections, statsVersion]);

  // Recompute edges + handles whenever nodes move
  useEffect(() => {
    if (nodes.length === 0 || filteredConnections.length === 0) return;
    const { edges: newEdges, activeHandles } = computeEdges(nodes, filteredConnections);
    setEdges(newEdges);
    // Update activeHandles on nodes
    setNodes((prev) =>
      prev.map((n) => {
        if (n.type !== "service") return n;
        const handles = activeHandles.get(n.id) || [];
        const current = (n.data as any).activeHandles || [];
        // Skip if unchanged
        if (handles.length === current.length && handles.every((h: string, i: number) => h === current[i])) return n;
        return { ...n, data: { ...n.data, activeHandles: handles } };
      })
    );
  }, [nodes.map((n) => `${n.id}:${n.position.x}:${n.position.y}`).join(","), filteredConnections]);

  // Flash nodes on Docker events
  useEffect(() => {
    if (events.length === 0) return;
    const latest = events[events.length - 1]!;
    const flashClass =
      latest.action === "start"
        ? "flash-start"
        : latest.action === "die" || latest.action === "stop"
          ? "flash-stop"
          : latest.action === "restart"
            ? "flash-restart"
            : "";

    if (!flashClass) return;

    setNodes((prev) =>
      prev.map((n) =>
        n.id === latest.service ? { ...n, data: { ...n.data, flash: flashClass } } : n
      )
    );

    setTimeout(() => {
      setNodes((prev) =>
        prev.map((n) =>
          n.id === latest.service ? { ...n, data: { ...n.data, flash: "" } } : n
        )
      );
    }, 1200);
  }, [events]);

  // Service name → UID map for flow path resolution
  const serviceNameToUid = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of services) {
      map.set(s.name, s.uid);
    }
    return map;
  }, [services]);

  const resolveFlowPath = useCallback((path: string[]): string[] => {
    return path.map((name) => serviceNameToUid.get(name) || name);
  }, [serviceNameToUid]);

  const handleSimulate = useCallback((flow: Flow) => {
    const pathUids = resolveFlowPath(flow.path);
    engine.spawn(flow.id, flow.color, flow.speed, pathUids);
    // Also broadcast via WS so other clients see it
    sendMessage({ type: "simulate_flow", flowId: flow.id });
  }, [resolveFlowPath, engine, sendMessage]);

  // Handle particle spawns from other clients via WS
  useEffect(() => {
    return onParticleSpawn((data) => {
      const pathUids = resolveFlowPath(data.path);
      engine.spawn(data.flowId, data.color, data.speed, pathUids);
    });
  }, [onParticleSpawn, resolveFlowPath, engine]);

  // Handle particle node hits — flash node with particle color
  const nodeHitTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const handleNodeHits = useCallback((hits: { nodeId: string; color: string }[]) => {
    for (const hit of hits) {
      // Clear existing timer for this node
      const existing = nodeHitTimers.current.get(hit.nodeId);
      if (existing) clearTimeout(existing);

      setNodes((prev) =>
        prev.map((n) =>
          n.id === hit.nodeId
            ? { ...n, data: { ...n.data, particleGlow: hit.color } }
            : n
        )
      );

      const timer = setTimeout(() => {
        setNodes((prev) =>
          prev.map((n) =>
            n.id === hit.nodeId
              ? { ...n, data: { ...n.data, particleGlow: "" } }
              : n
          )
        );
        nodeHitTimers.current.delete(hit.nodeId);
      }, 500);
      nodeHitTimers.current.set(hit.nodeId, timer);
    }
  }, [setNodes]);

  const runningCount = filteredServices.filter((s) => s.state === "running").length;

  // Highlight edges connected to selected node, dim the rest
  const connectedNodeIds = useMemo(() => {
    if (!selectedNode) return null;
    const ids = new Set<string>([selectedNode]);
    for (const e of edges) {
      if (e.source === selectedNode) ids.add(e.target);
      if (e.target === selectedNode) ids.add(e.source);
    }
    return ids;
  }, [selectedNode, edges]);

  const styledEdges = useMemo(() => {
    if (!selectedNode) return edges;
    return edges.map((e) => {
      const isConnected = e.source === selectedNode || e.target === selectedNode;
      return {
        ...e,
        style: {
          ...e.style,
          opacity: isConnected ? 1 : 0.08,
          strokeWidth: isConnected ? 2.5 : 1,
        },
      };
    });
  }, [edges, selectedNode]);

  const styledNodes = useMemo(() => {
    if (!connectedNodeIds) return nodes;
    return nodes.map((n) => {
      if (n.type !== "service") return n;
      const isConnected = connectedNodeIds.has(n.id);
      const isSelected = n.id === selectedNode;
      return {
        ...n,
        style: { ...n.style, opacity: isConnected ? 1 : 0.3 },
        data: { ...n.data, highlighted: isSelected || isConnected },
      };
    });
  }, [nodes, connectedNodeIds, selectedNode]);

  return (
    <div className="h-screen w-screen bg-slate-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800/80 bg-slate-900/90 backdrop-blur-sm relative z-[9999]">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <img
              src="/alteonx-logo.png"
              alt="Alteonx"
              className="w-7 h-7"
              style={{ filter: "brightness(0) saturate(100%) invert(45%) sepia(85%) saturate(2000%) hue-rotate(200deg) brightness(1.1)" }}
            />
            <span className="text-base font-bold text-white tracking-wide">
              DockerFlow
            </span>
            <span className="text-xs text-cyan-400 tracking-widest uppercase font-semibold">
              AlteonX
            </span>
          </div>
          <span className="text-xs text-slate-600 font-mono bg-slate-800 px-2 py-0.5 rounded">
            v0.1
          </span>
        </div>

        <div className="flex items-center gap-5">
          {/* Flow panel */}
          <FlowPanel
            flows={flows}
            settings={flowSettings}
            engine={engine}
            services={services}
            onSimulate={handleSimulate}
          />

          {/* Project filter dropdown */}
          {projects.length > 1 && (
            <div className="relative" ref={filterRef}>
              <button
                onClick={() => setFilterOpen((v) => !v)}
                className="flex items-center gap-2 text-sm text-slate-400 bg-slate-800/80 hover:bg-slate-700/80 px-3 py-1.5 rounded-md transition-colors"
              >
                Projects
                <span className="text-cyan-400 font-medium">
                  {projects.length - hiddenProjects.size}/{projects.length}
                </span>
                <ChevronDown size={14} className={`text-slate-500 transition-transform ${filterOpen ? "rotate-180" : ""}`} />
              </button>
              {filterOpen && (
                <div className="absolute top-full right-0 mt-1.5 bg-slate-800 border border-slate-700 rounded-lg shadow-xl shadow-black/40 py-1.5 min-w-[200px] z-[9999]">
                  {projects.map((p) => {
                    const active = !hiddenProjects.has(p);
                    const count = services.filter((s) => s.project === p).length;
                    return (
                      <button
                        key={p}
                        onClick={() => toggleProject(p)}
                        className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm hover:bg-slate-700/60 transition-colors"
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                          active ? "bg-cyan-500 border-cyan-500" : "border-slate-600"
                        }`}>
                          {active && <Check size={12} className="text-white" />}
                        </div>
                        <span className={active ? "text-slate-200" : "text-slate-500"}>{p}</span>
                        <span className="text-slate-500 ml-auto">{count}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Stats */}
          <span className="text-sm text-slate-500">
            <span className="text-emerald-400 font-medium">{runningCount}</span>
            <span className="text-slate-600">/{filteredServices.length}</span>
            <span className="text-slate-600 ml-1">containers</span>
          </span>

          {/* Connection status */}
          <div className="flex items-center gap-2">
            {connected ? (
              <Wifi size={15} className="text-emerald-500" />
            ) : (
              <WifiOff size={15} className="text-red-500" />
            )}
            <span className={`text-xs ${connected ? "text-emerald-500" : "text-red-500"}`}>
              {connected ? "Live" : "Offline"}
            </span>
          </div>

          {/* Logout (only if auth is active) */}
          {token && (
            <button
              onClick={() => { localStorage.removeItem("df:token"); window.location.reload(); }}
              className="text-slate-600 hover:text-slate-400 transition-colors"
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 min-h-0">
        <ReactFlow
          onInit={(instance) => { reactFlowRef.current = instance; }}
          nodes={styledNodes}
          edges={styledEdges}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={(_e, node) => {
            if (node.type === "service") {
              setSelectedNode(node.id);
              const svc = filteredServices.find((s) => s.uid === node.id);
              if (svc) setLogPanelService(svc);
            } else {
              setSelectedNode(null);
            }
          }}
          onNodeDragStop={() => setSelectedNode(null)}
          onPaneClick={() => { setSelectedNode(null); setLogPanelService(null); }}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.2}
          maxZoom={2.5}
          panOnScroll={true}
          proOptions={{ hideAttribution: true }}
        >
          <ParticleOverlay engine={engine} settings={flowSettings} onNodeHits={handleNodeHits} />
          <Background color="#1e293b" gap={24} size={1} />
          <Controls position="bottom-left" />

          {/* Edge legend */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-5 bg-slate-900/90 border border-slate-800 rounded-lg px-5 py-2.5 z-10">
            <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Conexiones</span>
            {[
              { icon: Database, color: "#336791", label: "Database" },
              { icon: Zap, color: "#F59E0B", label: "Cache" },
              { icon: Radio, color: "#A855F7", label: "Broker" },
              { icon: Globe, color: "#22C55E", label: "Proxy" },
            ].map(({ icon: Icon, color, label }) => (
              <div key={label} className="flex items-center gap-2">
                <div className="w-5 h-0.5 rounded-full" style={{ backgroundColor: color }} />
                <Icon size={13} style={{ color }} />
                <span className="text-xs" style={{ color }}>{label}</span>
              </div>
            ))}
          </div>

          <MiniMap
            position="bottom-right"
            nodeColor={(n) => {
              const state = (n.data as any)?.state;
              if (state === "running") return "#22c55e";
              if (state === "exited" || state === "dead") return "#ef4444";
              return "#f59e0b";
            }}
            style={{ background: "#0f172a" }}
          />
        </ReactFlow>
      </div>

      {logPanelService && (
        <LogPanel
          service={logPanelService}
          logLines={logLines}
          token={token}
          onClose={() => { setLogPanelService(null); setSelectedNode(null); }}
          sendMessage={sendMessage}
          clearLogLines={clearLogLines}
        />
      )}
    </div>
  );
}
