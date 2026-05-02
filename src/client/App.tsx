import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { ServiceNode } from "./nodes/ServiceNode";
import { GroupNode } from "./nodes/GroupNode";
import { useDocker } from "./hooks/useDocker";
import { buildLayout, computeEdges, NODE_WIDTH, NODE_HEIGHT, GROUP_PADDING, GROUP_HEADER } from "./engine/layout";
import { ParticleEngine } from "./engine/particles";
import { ParticleOverlay } from "./components/ParticleOverlay";
import { DetailPanel } from "./panels/DetailPanel";
import { LoginScreen } from "./components/LoginScreen";
import { OffsetEdge } from "./components/OffsetEdge";
import { HeaderBar } from "./components/HeaderBar";
import { EdgeLegend } from "./components/EdgeLegend";
import type { Service, Flow } from "../shared/types";

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

export default function App() {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState<boolean | null>(null);

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
  const { services, connections, stats, statsVersion, events, connected, logLines, sendMessage, clearLogLines, flows, flowSettings, onParticleSpawn, setProcessing, getLogsSince } = useDocker(token);
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
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [detailService, setDetailService] = useState<Service | null>(null);
  const reactFlowRef = useRef<any>(null);
  const prevViewport = useRef<{ x: number; y: number; zoom: number } | null>(null);
  const isDragging = useRef(false);

  const NODE_W = NODE_WIDTH;
  const NODE_H = NODE_HEIGHT;
  const G_PAD = GROUP_PADDING;
  const MIN_X = G_PAD;
  const MIN_Y = GROUP_HEADER + G_PAD;

  // Close detail panel and restore viewport (with slide-out delay)
  const [panelClosing, setPanelClosing] = useState(false);
  const closeDetail = useCallback(() => {
    if (panelClosing) return;
    setPanelClosing(true);
    setSelectedNode(null);
    if (prevViewport.current && reactFlowRef.current) {
      reactFlowRef.current.setViewport(prevViewport.current, { duration: 400 });
      prevViewport.current = null;
    }
    setTimeout(() => {
      setDetailService(null);
      setPanelClosing(false);
    }, 400);
  }, [panelClosing]);

  // Load saved positions
  useEffect(() => {
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    fetch("/api/positions", { headers })
      .then((r) => r.json())
      .then((data) => { savedPositions.current = data || {}; })
      .catch(() => {});
  }, [token]);

  // Save positions (debounced)
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

  const handleNodesChange = useCallback((changes: NodeChange<Node>[]) => {
    onNodesChange(changes);

    const hasPositionChange = changes.some((c) => c.type === "position");
    if (!hasPositionChange) return;

    const isDragEnd = changes.some((c) => c.type === "position" && (c as any).dragging === false);

    setNodes((prev) => {
      let changed = false;
      let nodes = [...prev];

      // Clamp Y only
      nodes = nodes.map((n) => {
        if (!n.parentId) return n;
        const clampedY = Math.max(MIN_Y, n.position.y);
        if (clampedY !== n.position.y) {
          changed = true;
          return { ...n, position: { x: n.position.x, y: clampedY } };
        }
        return n;
      });

      // Keep leftmost child at MIN_X
      const groupIds = [...new Set(nodes.filter((n) => n.parentId).map((n) => n.parentId!))];
      for (const gid of groupIds) {
        const kids = nodes.filter((n) => n.parentId === gid);
        const minChildX = Math.min(...kids.map((k) => k.position.x));
        if (minChildX !== MIN_X) {
          const shift = minChildX - MIN_X;
          changed = true;
          nodes = nodes.map((n) => {
            if (n.id === gid) return { ...n, position: { x: n.position.x + shift, y: n.position.y } };
            if (n.parentId === gid) return { ...n, position: { x: n.position.x - shift, y: n.position.y } };
            return n;
          });
        }
      }

      // Resize groups to fit children
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
      let positioned = newNodes.map((n) => {
        const saved = savedPositions.current[n.id];
        if (saved) return { ...n, position: saved };
        return n;
      });
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
        const newNodeMap = new Map(newNodes.map((n) => [n.id, n]));
        const prevNodeMap = new Map(prev.map((n) => [n.id, n]));

        // 1. Update existing nodes (keep position, update data)
        const result: Node[] = [];
        for (const nn of newNodes) {
          const existing = prevNodeMap.get(nn.id);
          if (existing) {
            // Keep position and style, update data
            result.push({ ...existing, data: nn.data });
          } else {
            // New node — use saved position if available
            const saved = savedPositions.current[nn.id];
            result.push(saved ? { ...nn, position: saved } : nn);
          }
        }
        // Nodes in prev but NOT in newNodes are simply dropped (they disappeared)

        // 2. Resize groups to fit their children
        for (let i = 0; i < result.length; i++) {
          const n = result[i];
          if (n.type !== "group") continue;
          const kids = result.filter((c) => c.parentId === n.id);
          if (kids.length === 0) continue;
          let maxRight = 0;
          let maxBottom = 0;
          for (const k of kids) {
            maxRight = Math.max(maxRight, k.position.x + NODE_W + G_PAD);
            maxBottom = Math.max(maxBottom, k.position.y + NODE_H + G_PAD);
          }
          const minW = NODE_W + G_PAD * 3;
          const newW = Math.max(maxRight, minW);
          const newH = Math.max(maxBottom, MIN_Y + NODE_H + G_PAD);
          result[i] = { ...n, style: { ...n.style, width: newW, height: newH } };
        }

        // 3. Recompute edges
        const { edges: updatedEdges, activeHandles } = computeEdges(result, filteredConnections);
        setEdges(updatedEdges);
        for (const n of result) {
          if (n.type === "service") {
            (n.data as any).activeHandles = activeHandles.get(n.id) || [];
          }
        }

        return result;
      });
    }
  }, [filteredServices, filteredConnections, statsVersion]);

  // Recompute edges + handles when nodes move
  useEffect(() => {
    if (nodes.length === 0 || filteredConnections.length === 0) return;
    const { edges: newEdges, activeHandles } = computeEdges(nodes, filteredConnections);
    setEdges(newEdges);
    setNodes((prev) =>
      prev.map((n) => {
        if (n.type !== "service") return n;
        const handles = activeHandles.get(n.id) || [];
        const current = (n.data as any).activeHandles || [];
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
      latest.action === "start" ? "flash-start" :
      latest.action === "die" || latest.action === "stop" ? "flash-stop" :
      latest.action === "restart" ? "flash-restart" : "";

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

  // Flow path resolution
  const serviceNameToUid = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of services) map.set(s.name, s.uid);
    return map;
  }, [services]);

  const resolveFlowPath = useCallback((path: string[]): string[] => {
    return path.map((name) => serviceNameToUid.get(name) || name);
  }, [serviceNameToUid]);

  const handleSimulate = useCallback((flow: Flow) => {
    const pathUids = resolveFlowPath(flow.path);
    engine.spawn(flow.id, flow.color, flow.speed, pathUids);
    sendMessage({ type: "simulate_flow", flowId: flow.id });
  }, [resolveFlowPath, engine, sendMessage]);

  useEffect(() => {
    return onParticleSpawn((data) => {
      const pathUids = resolveFlowPath(data.path);
      engine.spawn(data.flowId, data.color, data.speed, pathUids);
    });
  }, [onParticleSpawn, resolveFlowPath, engine]);

  // Particle node hits
  const nodeHitTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const handleNodeHits = useCallback((hits: { nodeId: string; color: string }[]) => {
    for (const hit of hits) {
      const existing = nodeHitTimers.current.get(hit.nodeId);
      if (existing) clearTimeout(existing);

      setNodes((prev) =>
        prev.map((n) =>
          n.id === hit.nodeId ? { ...n, data: { ...n.data, particleGlow: hit.color } } : n
        )
      );

      const timer = setTimeout(() => {
        setNodes((prev) =>
          prev.map((n) =>
            n.id === hit.nodeId ? { ...n, data: { ...n.data, particleGlow: "" } } : n
          )
        );
        nodeHitTimers.current.delete(hit.nodeId);
      }, 500);
      nodeHitTimers.current.set(hit.nodeId, timer);
    }
  }, [setNodes]);

  // Total resource consumption
  const totalStats = useMemo(() => {
    let cpu = 0;
    let mem = 0;
    for (const svc of filteredServices) {
      const s = stats.get(svc.uid);
      if (s) { cpu += s.cpu; mem += s.mem_mb; }
    }
    return { cpu, mem };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredServices, statsVersion]);

  // Dim nodes/edges when detail panel is open
  const dimmedNodes = useMemo(() => {
    if (!selectedNode) return nodes;
    return nodes.map((n) => {
      if (n.type !== "service") return n;
      const isSelected = n.id === selectedNode;
      return {
        ...n,
        style: { ...n.style, opacity: isSelected ? 1 : 0.25, transition: "opacity 0.4s ease" },
        data: { ...n.data, activeHandles: [] },
      };
    });
  }, [nodes, selectedNode]);

  const dimmedEdges = useMemo(() => {
    if (!selectedNode) return edges;
    return edges.map((e) => ({
      ...e,
      style: { ...e.style, opacity: 0.1, transition: "opacity 0.4s ease" },
      label: undefined,
      labelStyle: { opacity: 0 },
    }));
  }, [edges, selectedNode]);

  return (
    <div className="h-screen w-screen bg-slate-900 flex flex-col">
      <HeaderBar
        services={services}
        filteredServices={filteredServices}
        connected={connected}
        token={token}
        projects={projects}
        hiddenProjects={hiddenProjects}
        onToggleProject={toggleProject}
        totalStats={totalStats}
        flows={flows}
        flowSettings={flowSettings}
        engine={engine}
        onSimulate={handleSimulate}
      />

      {/* Canvas — inset */}
      <div className="flex-1 min-h-0 relative m-2 rounded-xl overflow-hidden ring-1 ring-slate-700/60 shadow-[inset_0_2px_12px_rgba(0,0,0,0.5)]">
        <ReactFlow
          onInit={(instance) => { reactFlowRef.current = instance; }}
          nodes={dimmedNodes}
          edges={dimmedEdges}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStart={() => { isDragging.current = true; }}
          onNodeDragStop={() => { isDragging.current = false; }}
          onNodeClick={(_e, node) => {
            if (isDragging.current) return;
            if (node.type !== "service") return;

            const svc = filteredServices.find((s) => s.uid === node.id);
            if (!svc) return;

            // Save current viewport before zooming
            if (reactFlowRef.current && !prevViewport.current) {
              prevViewport.current = reactFlowRef.current.getViewport();
            }

            // Compute absolute position (own position + parent group position)
            let absX = node.position.x;
            let absY = node.position.y;
            if (node.parentId) {
              const parent = nodes.find((n) => n.id === node.parentId);
              if (parent) {
                absX += parent.position.x;
                absY += parent.position.y;
              }
            }

            // Zoom to 1 and position node at ~75% from left (panel opens on left)
            const vw = window.innerWidth;
            const vh = window.innerHeight - 48; // subtract header height
            const zoom = 1.5;
            const targetX = vw * 0.75 - (absX + NODE_W / 2) * zoom;
            const targetY = vh * 0.5 - (absY + NODE_H / 2) * zoom;

            reactFlowRef.current?.setViewport({ x: targetX, y: targetY, zoom }, { duration: 400 });

            setSelectedNode(node.id);
            setDetailService(svc);
          }}
          onPaneClick={() => {
            if (detailService) closeDetail();
          }}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.3}
          maxZoom={1}
          panOnScroll={true}
          translateExtent={[[-1000, -1000], [8000, 6000]]}
          proOptions={{ hideAttribution: true }}
        >
          <ParticleOverlay engine={engine} settings={flowSettings} onNodeHits={handleNodeHits} />
          <Background color="#374151" gap={30} size={2} />
          <Controls position="bottom-left" />
          <EdgeLegend />
          <MiniMap
            position="bottom-right"
            nodeColor={(n) => {
              if (n.type === "group") return "#1e293b";
              const state = (n.data as any)?.state;
              if (state === "running") return "#22c55e80";
              if (state === "exited" || state === "dead") return "#ef444480";
              return "#f59e0b80";
            }}
            style={{ background: "#0f172a" }}
          />
        </ReactFlow>

        {detailService && (
          <DetailPanel
            service={filteredServices.find((s) => s.uid === detailService.uid) || detailService}
            stats={stats.get(detailService.uid)}
            logLines={logLines}
            token={token}
            closing={panelClosing}
            onClose={closeDetail}
            onAction={setProcessing}
            sendMessage={sendMessage}
            clearLogLines={clearLogLines}
            connections={filteredConnections}
            services={filteredServices}
            getLogsSince={getLogsSince}
          />
        )}
      </div>
    </div>
  );
}
