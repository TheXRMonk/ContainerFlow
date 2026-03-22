# Alteonx DockerFlow

Herramienta open source para visualizar arquitecturas Docker en tiempo real con partículas animadas que muestran el flujo de datos entre servicios.

```
git clone github.com/user/alteonx-dockerflow
cd alteonx-dockerflow
bun install
claude mcp add alteonx-dockerflow -- bun run src/mcp.ts

# Desde Claude Code:
> "arranca el visualizer"
> "Listo, abre http://localhost:9470"
```

---

## Stack

| Capa | Tecnología | Por qué |
|---|---|---|
| **Runtime** | Bun | 3x más rápido que Node, WebSocket nativo, bundler incluido, menos RAM |
| **Server** | Hono | 14KB, ultra rápido, soporte nativo Bun, middleware mínimo |
| **Frontend** | React 19 + @xyflow/react 12 | Librería de grafos más madura, nodos custom, edges custom, minimap |
| **Styling** | Tailwind v4 | Utility-first, tree-shaking agresivo, sin runtime |
| **Real-time** | Bun WebSocket | Nativo en Bun, zero dependencias, más rápido que socket.io |
| **Animaciones** | SVG animateMotion + CSS | Sin librerías extra, GPU-accelerated, zero overhead |
| **Docker API** | dockerode | Estándar de facto, tipado, streams |
| **MCP** | @modelcontextprotocol/sdk | SDK oficial, stdio transport |
| **Build** | Vite 6 | HMR instantáneo, tree-shaking, build optimizado |

### Recursos estimados
| Recurso | Valor |
|---|---|
| **RAM** | ~30-50 MB |
| **CPU** | <1% idle, ~2% durante polling |
| **Disco** | ~80 MB (node_modules), ~2 MB build |
| **Bundle** | ~150 KB gzip |
| **Startup** | <500ms con Bun |

### Dependencias totales (mínimas)
```json
{
  "dependencies": {
    "hono": "^4",
    "dockerode": "^4",
    "@modelcontextprotocol/sdk": "^1.12",
    "zod": "^3",
    "yaml": "^2"
  },
  "devDependencies": {
    "react": "^19",
    "react-dom": "^19",
    "@xyflow/react": "^12",
    "@dagrejs/dagre": "^1",
    "@vitejs/plugin-react": "^4",
    "tailwindcss": "^4",
    "vite": "^6",
    "typescript": "^5"
  }
}
```

---

## Arquitectura

```
┌──────────────────────────────────────────────────────────────────┐
│                     Docker Socket                                │
│                /var/run/docker.sock                               │
└──────────┬──────────────────────────────┬───────────────────────┘
           │                              │
           ▼                              ▼
┌──────────────────────┐       ┌──────────────────────────┐
│   Hono Server (:9470)│       │     MCP Server (stdio)   │
│                      │       │                          │
│  GET  /              │       │  Tools:                  │
│   → serve SPA        │       │   • start_dashboard      │
│                      │       │   • list_services        │
│  WS   /ws            │       │   • get_stats            │
│   → push eventos     │       │   • get_logs             │
│   → push stats       │       │   • restart_service      │
│                      │       │   • list_flows           │
│  Docker watcher:     │       │   • simulate_flow        │
│   • listContainers   │       │   • create_flow          │
│   • getEvents stream │       │                          │
│   • stats polling    │       │  Resources:              │
│                      │       │   • docker://services    │
│  Para: humanos 👀    │       │   • docker://flows       │
└──────────────────────┘       │                          │
                               │  Para: Claude Code 🤖   │
                               └──────────────────────────┘
```

---

## Estructura del proyecto

```
alteonx-dockerflow/
├── src/
│   ├── server/
│   │   ├── index.ts            # Hono server + WebSocket
│   │   ├── docker.ts           # Docker API wrapper (dockerode)
│   │   ├── watcher.ts          # Docker events stream + stats polling
│   │   └── flows.ts            # Flow engine (partículas)
│   ├── mcp/
│   │   └── index.ts            # MCP server (stdio)
│   ├── client/
│   │   ├── App.tsx             # React Flow canvas
│   │   ├── main.tsx            # Entry point
│   │   ├── nodes/
│   │   │   ├── ServiceNode.tsx # Nodo de container
│   │   │   └── ExternalNode.tsx# Nodo externo (APIs, users)
│   │   ├── edges/
│   │   │   └── ParticleEdge.tsx# Edge con partículas animadas
│   │   ├── panels/
│   │   │   ├── FlowPanel.tsx   # Panel de control de flows
│   │   │   ├── StatsPanel.tsx  # Panel de stats CPU/MEM
│   │   │   └── LogPanel.tsx    # Panel de logs
│   │   ├── hooks/
│   │   │   ├── useDocker.ts    # WebSocket hook
│   │   │   └── useFlows.ts     # Flow state management
│   │   └── engine/
│   │       ├── particles.ts    # Motor de partículas
│   │       └── layout.ts       # Auto-layout con dagre
│   └── shared/
│       └── types.ts            # Tipos compartidos server/client
├── flows.yaml                  # Config de flows (opcional)
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## Cómo funciona (para cualquier proyecto)

### 1. Auto-discovery (zero config)

El dashboard lee el Docker socket y automáticamente:

```ts
// src/server/docker.ts
import Docker from "dockerode";

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

export async function discoverServices() {
  const containers = await docker.listContainers({ all: true });

  return containers.map((c) => ({
    id: c.Id.slice(0, 12),
    name: c.Labels["com.docker.compose.service"] || c.Names[0].replace("/", ""),
    image: c.Image,
    state: c.State,
    status: c.Status,
    ports: c.Ports.filter((p) => p.PublicPort).map((p) => ({
      host: p.PublicPort,
      container: p.PrivatePort,
    })),
    networks: Object.keys(c.NetworkSettings.Networks),
    project: c.Labels["com.docker.compose.project"] || "standalone",
    compose_file: c.Labels["com.docker.compose.project.config_files"] || "",
  }));
}

export async function discoverConnections() {
  // Servicios en la misma network = conectados
  const networks = await docker.listNetworks();
  const connections: { from: string; to: string; network: string }[] = [];

  for (const net of networks) {
    const info = await docker.getNetwork(net.Id).inspect();
    const members = Object.values(info.Containers || {}).map((c: any) => c.Name);

    // Cada par de containers en la misma red = edge
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        connections.push({
          from: members[i],
          to: members[j],
          network: net.Name,
        });
      }
    }
  }

  return connections;
}
```

**Resultado:** sin configurar nada, el usuario ve todos sus containers como nodos y las conexiones de red como edges. Funciona con cualquier proyecto Docker.

### 2. Agrupación visual (subgraphs automáticos)

Cada container es su propio nodo (cuadro) con imagen, estado, puertos, stats. Los subgraphs son bordes visuales que agrupan containers del mismo compose file o proyecto.

**Docker expone 2 labels para agrupar:**
| Label | Qué es | Ejemplo |
|---|---|---|
| `com.docker.compose.project` | Nombre del proyecto (directorio) | `ninjasagacw` |
| `com.docker.compose.project.config_files` | Qué compose file lo levantó | `docker-compose.infra.yml` |

**Auto-detección del nivel de agrupación:**
```ts
function detectGrouping(services: Service[]): "project" | "compose_file" {
  const projects = new Set(services.map((s) => s.project));
  // Múltiples proyectos → agrupar por proyecto
  if (projects.size > 1) return "project";
  // 1 solo proyecto con múltiples compose files → agrupar por compose file
  return "compose_file";
}
```

**Caso 1: Un proyecto, múltiples compose files** (como NinjaSaga):
```
┌─ infra.yml ──────────────────────────────────────────────┐
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ 🐘 db        │  │ 📡 collector │  │ ⚡ redis      │   │
│  │ postgres:17  │  │ ./backend    │  │ redis:7      │   │
│  │ CPU 0.3%     │  │ CPU 1.2%     │  │ CPU 0.1%     │   │
│  │ MEM 45MB     │  │ MEM 82MB     │  │ MEM 12MB     │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
│                                                           │
│  ┌──────────────┐  ┌──────────────┐                      │
│  │ ⚙️ celery-   │  │ ⏰ celery-   │                      │
│  │   worker     │  │   beat       │                      │
│  │ CPU 0.5%     │  │ CPU 0.1%     │                      │
│  │ MEM 65MB     │  │ MEM 40MB     │                      │
│  └──────────────┘  └──────────────┘                      │
└───────────────────────────────────────────────────────────┘

┌─ dev.yml ────────────────────────────────────────────────┐
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ 🔧 backend   │  │ 🔑 auth      │  │ ⚙️ celery    │   │
│  │    -dev      │  │    -dev      │  │    -dev      │   │
│  │ :4020        │  │ :4021        │  │              │   │
│  │ CPU 0.8%     │  │ CPU 0.3%     │  │ CPU 0.2%     │   │
│  │ MEM 120MB    │  │ MEM 95MB     │  │ MEM 60MB     │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
│                                                           │
│  ┌──────────────┐                                        │
│  │ 🖥️ frontend  │                                        │
│  │    -dev      │                                        │
│  │ :4030        │                                        │
│  │ CPU 0.5%     │                                        │
│  │ MEM 180MB    │                                        │
│  └──────────────┘                                        │
└───────────────────────────────────────────────────────────┘

Edges cruzan entre subgraphs:
  backend-dev ──→ db (postgres)
  backend-dev ──→ redis (cache)
  frontend-dev ──→ backend-dev (proxy /data)
  collector ──→ db (snapshot)
  collector ──→ redis (invalidate)
  celery-worker ──→ redis (broker)
```

**Caso 2: Múltiples proyectos** (usuario con varios repos):
```
┌─ mi-saas ──────────────────┐  ┌─ monitoring ──────────────────┐
│                              │  │                                │
│  ┌────────┐  ┌────────┐    │  │  ┌──────────┐  ┌────────────┐ │
│  │ 🚀 api │  │ 🐘 db  │    │  │  │ 📊 grafana│  │ 📈 prometheus│
│  │ :3000  │  │        │    │  │  │ :3001    │  │             │ │
│  └────────┘  └────────┘    │  │  └──────────┘  └────────────┘ │
│                              │  │                                │
│  ┌────────┐  ┌────────┐    │  │  ┌──────────┐                  │
│  │ ⚡redis│  │ 🌐 web │    │  │  │ 📋 loki  │                  │
│  │        │  │ :8080  │    │  │  │          │                  │
│  └────────┘  └────────┘    │  │  └──────────┘                  │
└──────────────────────────────┘  └──────────────────────────────┘
```

**Implementación en React Flow:**
```tsx
// Los subgraphs se renderizan como nodos "group" de React Flow
function buildGroupNodes(services: Service[], groupBy: "project" | "compose_file") {
  const groups = new Map<string, Service[]>();

  for (const svc of services) {
    const key = groupBy === "project" ? svc.project : svc.compose_file;
    const label = groupBy === "compose_file"
      ? key.replace("docker-compose.", "").replace(".yml", "")  // "infra", "dev", "prod"
      : key;  // "mi-saas", "monitoring"
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(svc);
  }

  const nodes = [];

  for (const [groupLabel, svcs] of groups) {
    // Nodo grupo (subgraph visual)
    nodes.push({
      id: `group-${groupLabel}`,
      type: "group",
      data: { label: groupLabel },
      position: { x: 0, y: 0 },
      style: {
        border: "1px dashed #334155",
        borderRadius: 16,
        padding: 24,
        background: "rgba(30, 41, 59, 0.3)",
      },
    });

    // Nodos hijos dentro del grupo
    for (const svc of svcs) {
      nodes.push({
        id: svc.name,
        type: "service",
        data: { ...svc, label: svc.name },
        parentId: `group-${groupLabel}`,  // ← lo pone dentro del subgraph
        extent: "parent",
        position: { x: 0, y: 0 },  // dagre calcula la posición
      });
    }
  }

  return nodes;
}
```

### 3. Smart edge detection (heurísticas)

Además de redes, detecta relaciones por convención:

```ts
// src/server/docker.ts
export function inferEdgeType(from: Service, to: Service): EdgeType | null {
  const toImage = to.image.toLowerCase();
  const fromEnv = from.env || {};

  // Detectar DB connections
  if (toImage.includes("postgres") || toImage.includes("mysql") || toImage.includes("mongo")) {
    // Buscar en env vars del "from" si referencia al "to"
    for (const [key, val] of Object.entries(fromEnv)) {
      if (key.includes("DATABASE") || key.includes("DB_HOST") || key.includes("MONGO")) {
        return { type: "database", label: key.split("_")[0].toLowerCase() };
      }
    }
    return { type: "database", label: "db" };
  }

  // Detectar Redis connections
  if (toImage.includes("redis")) {
    return { type: "cache", label: "redis" };
  }

  // Detectar RabbitMQ / message brokers
  if (toImage.includes("rabbit") || toImage.includes("kafka")) {
    return { type: "broker", label: "messages" };
  }

  // Detectar nginx/traefik → upstream
  if (fromImage.includes("nginx") || fromImage.includes("traefik")) {
    return { type: "proxy", label: "upstream" };
  }

  return null;
}
```

### 3. Docker Events (automático, zero config)

```ts
// src/server/watcher.ts
import Docker from "dockerode";

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

export function watchDockerEvents(onEvent: (e: DockerEvent) => void) {
  docker.getEvents({}, (err, stream) => {
    if (err || !stream) return;
    stream.on("data", (chunk) => {
      try {
        const event = JSON.parse(chunk.toString());
        if (event.Type !== "container") return;

        onEvent({
          type: "docker",
          action: event.Action, // start, stop, die, restart, health_status
          service: event.Actor?.Attributes?.["com.docker.compose.service"]
                || event.Actor?.Attributes?.name
                || "unknown",
          time: event.time,
        });
      } catch {}
    });
  });
}
```

**Partículas gratis:** cada start/stop/restart se ve como un pulso animado en el nodo.

### 4. Stats polling

```ts
// src/server/watcher.ts
export async function pollStats(services: Service[]): Promise<Stats[]> {
  const running = services.filter((s) => s.state === "running");
  const results: Stats[] = [];

  for (const svc of running) {
    try {
      const container = docker.getContainer(svc.id);
      const raw = await container.stats({ stream: false });

      const cpuDelta = raw.cpu_stats.cpu_usage.total_usage - raw.precpu_stats.cpu_usage.total_usage;
      const sysDelta = raw.cpu_stats.system_cpu_usage - raw.precpu_stats.system_cpu_usage;

      results.push({
        service: svc.name,
        cpu: sysDelta > 0 ? (cpuDelta / sysDelta) * (raw.cpu_stats.online_cpus || 1) * 100 : 0,
        mem_mb: (raw.memory_stats.usage || 0) / 1024 / 1024,
        mem_percent: ((raw.memory_stats.usage || 0) / (raw.memory_stats.limit || 1)) * 100,
        net_rx_mb: Object.values(raw.networks || {}).reduce((a: number, n: any) => a + (n.rx_bytes || 0), 0) / 1024 / 1024,
        net_tx_mb: Object.values(raw.networks || {}).reduce((a: number, n: any) => a + (n.tx_bytes || 0), 0) / 1024 / 1024,
      });
    } catch {}
  }

  return results;
}
```

---

## Flows (simulaciones visuales)

Los flows son recorridos animados que muestran cómo viaja una request o evento por la arquitectura. Son **puramente visuales** y sirven para entender y presentar tu sistema.

### Dos modos

**Modo simulación (MVP, funciona para todos):**
- El usuario define un path: "request pasa por nginx → backend → redis → db"
- Click en "simular" → partícula recorre esa ruta con animación
- Como un diagrama de secuencia pero animado y en el grafo real
- No necesita conectar nada, solo definir el camino

**Modo eventos reales (avanzado, opcional):**
- Requiere un probe (middleware) en los servicios
- El probe emite eventos a Redis/WebSocket
- El dashboard escucha y dispara partículas automáticamente
- Para fase 2+, no MVP

### Configuración de flows — `flows.yaml`

```yaml
# flows.yaml — Define recorridos visuales en tu arquitectura
# Cada flow es un camino que una operación recorre entre servicios

flows:
  # Ejemplo genérico: request HTTP
  api_request:
    name: "API Request"
    description: "Request del usuario al backend"
    color: "#3b82f6"                  # azul
    speed: 0.8                        # segundos por edge
    path: [nginx, backend, redis, db, backend, nginx]

  # Ejemplo: background job
  background_job:
    name: "Background Job"
    description: "Tarea programada del worker"
    color: "#ec4899"                  # rosa
    speed: 1.0
    path: [redis, worker, db, worker]

  # Ejemplo: cache flow
  cache_hit:
    name: "Cache Hit"
    description: "Request servida desde cache"
    color: "#22c55e"                  # verde
    speed: 0.5
    path: [nginx, backend, redis, backend, nginx]

  cache_miss:
    name: "Cache Miss"
    description: "Cache miss, va a DB"
    color: "#f59e0b"                  # amarillo
    speed: 0.8
    path: [nginx, backend, redis, db, redis, backend, nginx]

# Los nombres de servicios deben coincidir con el nombre del container
# (com.docker.compose.service label o container name)

settings:
  particle_size: 5                    # radio en px
  trail: true                         # estela detrás de la partícula
  trail_opacity: 0.3
  glow: true                          # efecto neón
  max_particles: 50                   # máximo simultáneas
  auto_simulate: false                # simular automáticamente en idle
  auto_simulate_interval: 5           # segundos entre simulaciones auto
```

**Zero config posible:** sin `flows.yaml` el dashboard muestra la arquitectura estática con stats. Los flows son un addon visual opcional.

### Motor de partículas

```tsx
// src/client/engine/particles.ts

interface Particle {
  id: string;
  flowName: string;
  color: string;
  path: string[];              // lista de service names
  currentStep: number;         // índice actual en path
  progress: number;            // 0-1 progreso en el edge actual
  label?: string;
}

class ParticleEngine {
  particles: Particle[] = [];
  private maxParticles = 50;

  spawn(flow: Flow, label?: string) {
    if (this.particles.length >= this.maxParticles) return;
    this.particles.push({
      id: crypto.randomUUID(),
      flowName: flow.name,
      color: flow.color,
      path: flow.path,
      currentStep: 0,
      progress: 0,
      label,
    });
  }

  tick(deltaMs: number, speed: number) {
    const step = deltaMs / (speed * 1000);
    this.particles = this.particles.filter((p) => {
      p.progress += step;
      if (p.progress >= 1) {
        p.currentStep++;
        p.progress = 0;
        // Llegó al final → flash en nodo destino → eliminar
        if (p.currentStep >= p.path.length - 1) return false;
      }
      return true;
    });
  }
}
```

### Partícula visual (SVG sobre React Flow edge)

```tsx
// src/client/edges/ParticleEdge.tsx
import { BaseEdge, getSmoothStepPath, type EdgeProps } from "@xyflow/react";

export function ParticleEdge({ id, sourceX, sourceY, targetX, targetY, ...props }: EdgeProps) {
  const [path] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY });
  const particles = useParticlesForEdge(id); // del engine

  return (
    <>
      <BaseEdge id={id} path={path} style={{ stroke: "#334155", strokeWidth: 2 }} />
      <svg>
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {particles.map((p) => (
          <g key={p.id}>
            {/* Estela */}
            <circle r="3" fill={p.color} opacity="0.3" filter="url(#glow)">
              <animateMotion dur={`${p.speed}s`} path={path} keyPoints={`${p.progress};${p.progress}`} keyTimes="0;1" fill="freeze" />
            </circle>
            {/* Partícula principal */}
            <circle r="5" fill={p.color} filter="url(#glow)">
              <animateMotion dur={`${p.speed}s`} path={path} keyPoints={`${p.progress};${p.progress}`} keyTimes="0;1" fill="freeze" />
            </circle>
            {/* Label */}
            {p.label && (
              <text fill="#e2e8f0" fontSize="9" textAnchor="middle" dy="-14">
                <animateMotion dur={`${p.speed}s`} path={path} keyPoints={`${p.progress};${p.progress}`} keyTimes="0;1" fill="freeze" />
                {p.label}
              </text>
            )}
          </g>
        ))}
      </svg>
    </>
  );
}
```

### Panel de control de flows

```
┌──────────────────────────────────────────────────────────────┐
│  Flows                                               [⚙️]   │
├──────────────────────────────────────────────────────────────┤
│  ● API Request          0/min    [  ON  ]   [ ▶ Simular ]   │
│  ● Cache Hit            0/min    [  ON  ]   [ ▶ Simular ]   │
│  ● Cache Miss           0/min    [  ON  ]   [ ▶ Simular ]   │
│  ● Background Job       0/min    [  ON  ]   [ ▶ Simular ]   │
├──────────────────────────────────────────────────────────────┤
│  [ ▶ Simular todos ]   [ ⏸ Pausar ]   [ + Nuevo flow ]     │
└──────────────────────────────────────────────────────────────┘
```

---

## Nodo visual (ServiceNode)

```tsx
// src/client/nodes/ServiceNode.tsx
import { Handle, Position } from "@xyflow/react";

const stateStyles = {
  running: { ring: "ring-emerald-500/50", dot: "bg-emerald-500", bg: "bg-emerald-500/10" },
  exited:  { ring: "ring-red-500/50",     dot: "bg-red-500",     bg: "bg-red-500/10" },
  paused:  { ring: "ring-amber-500/50",   dot: "bg-amber-500",   bg: "bg-amber-500/10" },
};

const imageIcons: Record<string, string> = {
  postgres: "🐘", redis: "⚡", nginx: "🔀", node: "💚", python: "🐍",
  mongo: "🍃", mysql: "🐬", rabbitmq: "🐰", certbot: "📜",
};

function guessIcon(image: string): string {
  for (const [key, icon] of Object.entries(imageIcons)) {
    if (image.toLowerCase().includes(key)) return icon;
  }
  return "📦";
}

export function ServiceNode({ data }: { data: ServiceNodeData }) {
  const s = stateStyles[data.state] || stateStyles.exited;
  const icon = guessIcon(data.image);

  return (
    <div className={`relative rounded-xl border border-slate-700 ${s.bg} backdrop-blur-sm
                      shadow-lg shadow-black/30 p-4 min-w-[180px] ring-2 ${s.ring}
                      transition-all duration-500`}>
      <Handle type="target" position={Position.Top} className="!bg-slate-500" />

      {/* Status dot + name */}
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-2.5 h-2.5 rounded-full ${s.dot}
                        ${data.state === "running" ? "animate-pulse" : ""}`} />
        <span className="font-bold text-white text-sm">{icon} {data.label}</span>
      </div>

      {/* Image */}
      <div className="text-[11px] text-slate-400 truncate mb-1">{data.image}</div>

      {/* Ports */}
      {data.ports?.length > 0 && (
        <div className="flex gap-1 flex-wrap mt-1.5">
          {data.ports.map((p) => (
            <span key={p} className="text-[10px] bg-slate-800 text-cyan-400 px-1.5 py-0.5 rounded font-mono">
              :{p}
            </span>
          ))}
        </div>
      )}

      {/* Stats bar */}
      {data.stats && (
        <div className="mt-2.5 space-y-1">
          <div className="flex justify-between text-[10px] text-slate-400">
            <span>CPU {data.stats.cpu.toFixed(1)}%</span>
            <span>MEM {data.stats.mem_mb.toFixed(0)}MB</span>
          </div>
          <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500/70 rounded-full transition-all duration-500"
                 style={{ width: `${Math.min(data.stats.cpu, 100)}%` }} />
          </div>
        </div>
      )}

      {/* Compose project badge */}
      {data.project && (
        <div className="mt-2 flex justify-end">
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
            {data.project}
          </span>
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!bg-slate-500" />
    </div>
  );
}
```

---

## Server (Hono + Bun WebSocket)

```ts
// src/server/index.ts
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { discoverServices, discoverConnections } from "./docker";
import { watchDockerEvents, pollStats } from "./watcher";
import { FlowEngine } from "./flows";
import { parse } from "yaml";
import { readFileSync, existsSync } from "fs";

const app = new Hono();
const flowEngine = new FlowEngine();

// Load flows if exists
if (existsSync("flows.yaml")) {
  const config = parse(readFileSync("flows.yaml", "utf-8"));
  flowEngine.loadFlows(config.flows || []);
}

// Serve frontend
app.use("/*", serveStatic({ root: "./dist" }));

// REST endpoints (para MCP y fallback)
app.get("/api/services", async (c) => c.json(await discoverServices()));
app.get("/api/connections", async (c) => c.json(await discoverConnections()));
app.get("/api/flows", (c) => c.json(flowEngine.getFlows()));
app.post("/api/flows/:name/simulate", (c) => {
  flowEngine.simulate(c.req.param("name"));
  return c.json({ ok: true });
});

// WebSocket (Bun native)
const clients = new Set<WebSocket>();

const PORT = parseInt(process.env.PORT || "9470");
const AUTH_TOKEN = process.env.AUTH_TOKEN || "";
const HOST = AUTH_TOKEN ? "0.0.0.0" : "127.0.0.1";

Bun.serve({
  hostname: HOST,
  port: PORT,
  fetch: app.fetch,
  websocket: {
    open(ws) { clients.add(ws); },
    close(ws) { clients.delete(ws); },
    message(ws, msg) {
      const data = JSON.parse(msg.toString());
      if (data.type === "simulate") flowEngine.simulate(data.flow);
    },
  },
});

function broadcast(type: string, data: any) {
  const msg = JSON.stringify({ type, data });
  for (const ws of clients) ws.send(msg);
}

// Docker events → broadcast
watchDockerEvents((event) => broadcast("docker_event", event));

// Stats polling cada 3s
setInterval(async () => {
  const services = await discoverServices();
  const connections = await discoverConnections();
  const stats = await pollStats(services);
  broadcast("services", services);
  broadcast("connections", connections);
  broadcast("stats", stats);
}, 3000);

// Particle engine tick (60fps)
setInterval(() => {
  const particles = flowEngine.tick(16);
  if (particles.length > 0) broadcast("particles", particles);
}, 16);

console.log(`Alteonx DockerFlow running on http://${HOST}:${PORT}`);
```

---

## MCP Server

```ts
// src/mcp/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import Docker from "dockerode";
import { z } from "zod";
import { execSync } from "child_process";

const docker = new Docker({ socketPath: "/var/run/docker.sock" });
const server = new McpServer({ name: "alteonx-dockerflow", version: "1.0.0" });

// ── Dashboard control ──

server.tool("start_dashboard",
  "Start the Alteonx DockerFlow dashboard and return the URL",
  { port: z.number().default(9470) },
  async ({ port }) => {
    // Arranca el server en background
    execSync(`bun run src/server/index.ts &`, { stdio: "ignore" });
    return { content: [{ type: "text", text: `Dashboard running at http://localhost:${port}` }] };
  }
);

// ── Docker tools ──

server.tool("list_services",
  "List all Docker containers with status, ports, image",
  {},
  async () => {
    const containers = await docker.listContainers({ all: true });
    const services = containers.map((c) => ({
      name: c.Labels["com.docker.compose.service"] || c.Names[0]?.replace("/", ""),
      state: c.State,
      status: c.Status,
      image: c.Image,
      ports: c.Ports.filter((p) => p.PublicPort).map((p) => `${p.PublicPort}:${p.PrivatePort}`),
      project: c.Labels["com.docker.compose.project"] || "",
    }));
    return { content: [{ type: "text", text: JSON.stringify(services, null, 2) }] };
  }
);

server.tool("get_stats",
  "Get CPU and memory stats for a container",
  { container: z.string().describe("Container name or ID") },
  async ({ container }) => {
    const c = docker.getContainer(container);
    const raw = await c.stats({ stream: false });
    const cpuDelta = raw.cpu_stats.cpu_usage.total_usage - raw.precpu_stats.cpu_usage.total_usage;
    const sysDelta = raw.cpu_stats.system_cpu_usage - raw.precpu_stats.system_cpu_usage;
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          cpu_percent: (sysDelta > 0 ? (cpuDelta / sysDelta) * (raw.cpu_stats.online_cpus || 1) * 100 : 0).toFixed(2),
          mem_mb: ((raw.memory_stats.usage || 0) / 1024 / 1024).toFixed(1),
          mem_percent: (((raw.memory_stats.usage || 0) / (raw.memory_stats.limit || 1)) * 100).toFixed(1),
        }, null, 2),
      }],
    };
  }
);

server.tool("get_logs",
  "Get recent logs from a container",
  {
    container: z.string().describe("Container name or ID"),
    tail: z.number().default(50).describe("Number of lines"),
  },
  async ({ container, tail }) => {
    const logs = await docker.getContainer(container).logs({
      stdout: true, stderr: true, tail, timestamps: true,
    });
    return { content: [{ type: "text", text: logs.toString() }] };
  }
);

server.tool("restart_service",
  "Restart a Docker container",
  { container: z.string() },
  async ({ container }) => {
    await docker.getContainer(container).restart();
    return { content: [{ type: "text", text: `Restarted: ${container}` }] };
  }
);

server.tool("inspect_service",
  "Get detailed info about a container (filters secrets from env)",
  { container: z.string() },
  async ({ container }) => {
    const info = await docker.getContainer(container).inspect();
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          name: info.Name,
          state: info.State,
          image: info.Config.Image,
          cmd: info.Config.Cmd,
          env: info.Config.Env?.filter((e) =>
            !e.match(/PASSWORD|SECRET|KEY|TOKEN|PRIVATE/i)
          ),
          networks: Object.keys(info.NetworkSettings.Networks || {}),
          mounts: info.Mounts?.map((m) => ({
            type: m.Type, src: m.Source, dst: m.Destination,
          })),
          ports: info.NetworkSettings.Ports,
        }, null, 2),
      }],
    };
  }
);

server.tool("get_networks",
  "List Docker networks and connected containers",
  {},
  async () => {
    const networks = await docker.listNetworks();
    const result = [];
    for (const net of networks) {
      const info = await docker.getNetwork(net.Id).inspect();
      result.push({
        name: net.Name,
        driver: net.Driver,
        containers: Object.values(info.Containers || {}).map((c: any) => c.Name),
      });
    }
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Flow tools ──

server.tool("list_flows",
  "List configured flow simulations",
  {},
  async () => {
    // Read flows.yaml
    const { readFileSync, existsSync } = await import("fs");
    const { parse } = await import("yaml");
    if (!existsSync("flows.yaml")) {
      return { content: [{ type: "text", text: "No flows.yaml found. Create one to define flow simulations." }] };
    }
    const config = parse(readFileSync("flows.yaml", "utf-8"));
    const flows = Object.entries(config.flows || {}).map(([key, f]: [string, any]) => ({
      id: key,
      name: f.name,
      color: f.color,
      path: f.path.join(" → "),
      description: f.description || "",
    }));
    return { content: [{ type: "text", text: JSON.stringify(flows, null, 2) }] };
  }
);

server.tool("simulate_flow",
  "Trigger a flow simulation on the dashboard",
  { flow: z.string().describe("Flow ID from flows.yaml") },
  async ({ flow }) => {
    // POST to dashboard API
    try {
      await fetch(`http://localhost:9470/api/flows/${flow}/simulate`, { method: "POST" });
      return { content: [{ type: "text", text: `Simulation triggered: ${flow}` }] };
    } catch {
      return { content: [{ type: "text", text: "Dashboard not running. Use start_dashboard first." }] };
    }
  }
);

server.tool("create_flow",
  "Add a new flow simulation to flows.yaml",
  {
    id: z.string().describe("Unique flow ID (snake_case)"),
    name: z.string().describe("Display name"),
    color: z.string().describe("Hex color for the particle"),
    path: z.array(z.string()).describe("Ordered list of service names the flow traverses"),
    description: z.string().optional(),
  },
  async ({ id, name, color, path, description }) => {
    const { readFileSync, writeFileSync, existsSync } = await import("fs");
    const { parse, stringify } = await import("yaml");

    const file = "flows.yaml";
    const config = existsSync(file) ? parse(readFileSync(file, "utf-8")) : { flows: {}, settings: {} };

    config.flows[id] = {
      name,
      description: description || "",
      color,
      speed: 0.8,
      path,
    };

    writeFileSync(file, stringify(config));
    return { content: [{ type: "text", text: `Flow "${name}" created: ${path.join(" → ")}` }] };
  }
);

// ── Resources ──

server.resource("services", "docker://services", async (uri) => ({
  contents: [{
    uri: uri.href,
    mimeType: "application/json",
    text: JSON.stringify(await docker.listContainers({ all: true }), null, 2),
  }],
}));

server.resource("flows", "docker://flows", async (uri) => {
  const { readFileSync, existsSync } = await import("fs");
  return {
    contents: [{
      uri: uri.href,
      mimeType: "text/yaml",
      text: existsSync("flows.yaml") ? readFileSync("flows.yaml", "utf-8") : "# No flows configured",
    }],
  };
});

// ── Start ──

const transport = new StdioServerTransport();
await server.connect(transport);
```

### Setup en Claude Code
```bash
# Instalar
git clone github.com/user/alteonx-dockerflow
cd alteonx-dockerflow
bun install

# Agregar MCP
claude mcp add alteonx-dockerflow -- bun run src/mcp/index.ts

# Usar
> "arranca el dashboard"                     → start_dashboard
> "qué containers tengo?"                    → list_services
> "cuánta RAM usa el backend?"               → get_stats
> "crea un flow para mi login endpoint"      → create_flow
> "simula el login flow"                     → simulate_flow
> "muéstrame los logs de redis"              → get_logs
```

---

## Seguridad

### Comportamiento por defecto (seguro sin configurar nada)

| `AUTH_TOKEN` | Bind | Acceso | Uso |
|---|---|---|---|
| No definido | `127.0.0.1:9470` | Solo local | Dev en tu máquina |
| Definido | `0.0.0.0:9470` | Remoto (con token) | SSH a servidor, equipo |

```ts
// src/server/index.ts
const AUTH_TOKEN = process.env.AUTH_TOKEN || "";
const HOST = AUTH_TOKEN ? "0.0.0.0" : "127.0.0.1";

Bun.serve({
  hostname: HOST,
  port: 9470,
  // ...
});
```

### Cómo funciona el auth

**Sin token (default):** bind a `127.0.0.1`, solo accesible desde tu máquina. No pide nada.

**Con token:** bind a `0.0.0.0`, el dashboard pide el token al entrar:

```
┌─────────────────────────────────────────┐
│                                         │
│        🔒 Alteonx DockerFlow            │
│                                         │
│   ┌─────────────────────────────────┐   │
│   │  Token: ••••••••••              │   │
│   └─────────────────────────────────┘   │
│              [ Entrar ]                 │
│                                         │
└─────────────────────────────────────────┘
```

- El token se guarda en `localStorage` (no lo pide cada vez)
- Toda request HTTP y conexión WebSocket valida el token
- Token inválido → 401 Unauthorized

```ts
// Middleware de auth
app.use("*", async (c, next) => {
  if (!AUTH_TOKEN) return next(); // sin token = sin auth

  // Skip para la página de login
  if (c.req.path === "/" || c.req.path === "/auth") return next();

  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (token !== AUTH_TOKEN) return c.json({ error: "Unauthorized" }, 401);

  return next();
});

// WebSocket auth
websocket: {
  open(ws) {
    if (AUTH_TOKEN && ws.data.token !== AUTH_TOKEN) {
      ws.close(1008, "Unauthorized");
      return;
    }
    clients.add(ws);
  },
}
```

### Setup remoto (SSH)
```bash
# En el servidor
AUTH_TOKEN=mi-clave-super-segura bun run src/server/index.ts

# Desde tu máquina
# Abrir http://servidor:9470 → pide token → listo
```

### Qué se protege

| Recurso | Sin auth | Con auth |
|---|---|---|
| Dashboard visual | Accesible (localhost) | Requiere token |
| WebSocket (stats, eventos) | Accesible (localhost) | Requiere token |
| API `/api/services` | Accesible (localhost) | Requiere token |
| MCP Server | Siempre local (stdio) | N/A (no pasa por HTTP) |
| Docker socket | Read-only (`:ro`) | Read-only (`:ro`) |

### Qué NO expone nunca
- Variables de entorno con `PASSWORD`, `SECRET`, `KEY`, `TOKEN`, `PRIVATE` se filtran automáticamente en `inspect_service`
- El Docker socket se monta como read-only (`:ro`) — no puede crear/eliminar containers desde el dashboard
- El MCP sí puede hacer `restart_service` porque corre local y tiene approval flow de Claude Code

---

## Colores

| Tipo | Color | Uso |
|---|---|---|
| HTTP request | `#3b82f6` azul | Partículas de requests |
| Cache | `#f59e0b` amarillo | Redis hit/miss/invalidate |
| Database | `#8b5cf6` violeta | Queries a PostgreSQL/MySQL |
| Push/WebSocket | `#22c55e` verde | Notificaciones, eventos real-time |
| Email/external | `#ef4444` rojo | Envíos de email, llamadas API externas |
| Background job | `#ec4899` rosa | Celery, cron, workers |
| Docker event | `#64748b` gris | Container start/stop/restart |
| Nodo running | `#22c55e` verde | Borde + pulso animado |
| Nodo stopped | `#ef4444` rojo | Borde estático |

---

## Filtrado de proyectos

### Por CLI (qué containers carga el backend)

| Modo | Comando | Qué carga |
|---|---|---|
| **Auto** (default) | `bunx alteonx-dockerflow` | Solo containers del proyecto actual (detecta por directorio) |
| **Multi** | `bunx alteonx-dockerflow --projects ninjasagacw,tonal` | Containers de proyectos específicos |
| **All** | `bunx alteonx-dockerflow --all` | Todo lo que esté corriendo |

```ts
// src/server/index.ts
const args = process.argv.slice(2);
const ALL = args.includes("--all");
const PROJECTS = args.find((a) => a.startsWith("--projects="))?.split("=")[1]?.split(",")
              || [path.basename(process.cwd())];  // default: nombre del directorio actual

function filterServices(services: Service[]): Service[] {
  if (ALL) return services;
  return services.filter((s) => PROJECTS.includes(s.project));
}
```

### Por frontend (filtro visual en vivo)

El backend siempre envía el campo `project` en cada servicio. El frontend tiene un dropdown con checkboxes para filtrar sin reiniciar:

```
┌──────────────────────────────────────────────────────┐
│  Alteonx DockerFlow              [Proyecto ▼]  [⚙️]  │
│                                   ☑ ninjasagacw     │
│                                   ☑ tonal           │
│                                   ☑ megalabs        │
│                                   ──────────        │
│                                   ☑ Mostrar todos   │
└──────────────────────────────────────────────────────┘
```

- Checkboxes por proyecto, filtra los nodos en vivo
- Selección se guarda en `localStorage`
- Si usaste `--all` ves todos los proyectos disponibles para filtrar
- Si usaste modo auto, solo ves el proyecto actual (sin dropdown)

### Para apagar
- `Ctrl+C` en la terminal
- Desde MCP: `> "apaga el dashboard"` → tool `stop_dashboard`

---

## Dificultad para el usuario final

| Paso | Dificultad | Tiempo |
|---|---|---|
| `git clone` + `bun install` | Trivial | 30s |
| `claude mcp add` | Trivial | 10s |
| "arranca el dashboard" | Trivial | 5s |
| Ver arquitectura + stats | Automático | 0s (auto-discovery) |
| Definir flows custom | Fácil (YAML o via MCP) | 2-5 min |
| Conectar probes reales | Intermedio (middleware) | 15-30 min |

**Requisitos del usuario:**
- Docker instalado y corriendo
- Bun instalado (`curl -fsSL https://bun.sh/install | bash`)
- Claude Code con MCP (opcional, puede usar sin MCP también)

---

## Roadmap

### Fase 1 — MVP (auto-discovery + stats + agrupación)
- [ ] Server Hono + Bun WebSocket
- [ ] Auto-discovery de containers desde Docker socket
- [ ] Smart edge detection (networks + heurísticas)
- [ ] **Agrupación visual por compose project/file** (subgraph con borde + label)
- [ ] **Filtrado por proyecto**: CLI (`--all`, `--projects`, auto) + dropdown en frontend
- [ ] ServiceNode con estado, imagen, puertos, stats
- [ ] Auto-layout con dagre (respetando grupos)
- [ ] Stats polling (CPU/MEM) cada 3s
- [ ] Docker events (start/stop/restart) como pulso en nodos
- [ ] Dark theme, minimap, zoom, pan

### Fase 2 — Flows (partículas)
- [ ] Flow engine con partículas SVG animadas
- [ ] flows.yaml parser
- [ ] Panel de control de flows (toggle, simulate)
- [ ] Efecto glow/neón en partículas
- [ ] Trail (estela) detrás de cada partícula

### Fase 3 — MCP
- [ ] MCP server con tools de Docker + flows
- [ ] start_dashboard, list_services, get_stats, get_logs, restart
- [ ] list_flows, simulate_flow, create_flow
- [ ] Resources: docker://services, docker://flows
- [ ] README con instrucciones de setup

### Fase 4 — Polish
- [ ] Click en nodo → panel lateral con logs en vivo
- [ ] Modo "demo" / auto-simulate para presentaciones
- [ ] Responsive (funcione en tablet)
- [ ] Export PNG/SVG del grafo actual
- [ ] Customizar posiciones de nodos (drag + guardar layout)

### Fase 5 — Avanzado
- [ ] Probe middleware genérico (npm package para Express/Fastify/Hono)
- [ ] Probe middleware genérico (pip package para FastAPI/Django)
- [ ] Eventos reales → partículas automáticas
- [ ] Health check status en nodos (healthy/unhealthy/starting)
- [ ] Métricas históricas (SQLite para mini-gráficas en cada nodo)
- [ ] Alertas cuando un container se cae (webhook/push)
- [ ] Multi-host (Docker Swarm / remote Docker sockets)
