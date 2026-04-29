# Flowteon

Real-time Docker architecture visualizer. Displays services, connections and metrics from all your Docker Compose projects in an interactive dashboard.

## Requisitos

- [Bun](https://bun.sh) >= 1.0
- Docker corriendo con acceso al socket (`/var/run/docker.sock`)

## Instalacion

```bash
git clone https://github.com/RGJorge/flowteon.git
cd flowteon
bun install
```

## Configuracion

Copiar el archivo de ejemplo y editar:

```bash
cp .env.example .env
```

Variables disponibles:

| Variable | Default | Descripcion |
|---|---|---|
| `PORT` | `9470` | Puerto del servidor |
| `AUTH_TOKEN` | _(vacio)_ | Token de autenticacion. Vacio = sin auth, solo localhost. Con valor = auth activado, acceso remoto |

## Uso

### Desarrollo (hot reload)

```bash
bun run dev
```

Abre `http://localhost:5173` (Vite proxy → backend en puerto 9470).

### Produccion

```bash
bun run build
bun run start
```

Abre `http://localhost:9470`.

### Modos de visualizacion

```bash
# Ver TODOS los containers Docker
bun run start -- --all

# Ver solo proyectos especificos
bun run start -- --projects=mi-proyecto,otro-proyecto

# Auto-detectar desde el directorio actual
bun run start
```

## Funcionalidades

- **Descubrimiento automatico** — detecta servicios via Docker socket, agrupa por proyecto o compose file
- **Conexiones inteligentes** — detecta relaciones app→database, app→cache, proxy→app, worker→broker
- **Metricas en tiempo real** — CPU y memoria por container, actualizado cada 3 segundos
- **Eventos Docker** — flash visual cuando un container inicia, para o reinicia
- **Filtro de proyectos** — dropdown para mostrar/ocultar proyectos, persiste entre sesiones
- **Autenticacion** — pantalla de login con AUTH_TOKEN para acceso remoto seguro
- **Simulacion de flujos** — particulas animadas que recorren los edges para visualizar como viajan los requests/datos entre servicios. Configurable via `flows.yaml`
- **Leyenda de conexiones** — colores por tipo: Database (azul), Cache (rojo), Broker (naranja), Proxy (verde)
- **Grupos visuales** — recuadros por proyecto/compose con titulo, archivo compose y conteo de containers
- **Logs de containers** — click en un container para ver sus logs en tiempo real, con scroll automatico y opcion de copiar
- **Tooltips** — hover sobre cada nodo para ver estado, imagen, ID y puertos

## Simulacion de Flujos

Crea un archivo `flows.yaml` en la raiz del proyecto para definir flujos de datos animados:

```yaml
flows:
  api_request:
    name: "API Request"
    color: "#22d3ee"
    speed: 1.4
    path: [nginx, backend, db, backend, nginx]

  background_job:
    name: "Tarea en Background"
    color: "#ec4899"
    speed: 1.8
    path: [celery-beat, ninja-redis, celery-worker, db]

settings:
  particle_size: 2
  trail: true
  trail_opacity: 0.3
  glow: true
  max_particles: 50
```

- **path** usa los nombres de los servicios (como aparecen en `docker compose ps`)
- **speed** controla la velocidad (mayor = mas lento)
- Las particulas recorren los edges entre nodos, incluyendo caminos de ida y vuelta
- Al llegar a cada nodo, la particula hace una pausa y el nodo se ilumina con el color del flujo
- Si no existe `flows.yaml`, el panel de flujos no aparece
- **Modo Demo** — boton "Demo" en el panel que auto-simula flujos en loop cada ~3 segundos, ciclando entre todos los flujos definidos. Ideal para presentaciones

## MCP Server (Claude Code integration)

DockerFlow incluye un servidor MCP (Model Context Protocol) que permite gestionar flujos y monitorear servicios Docker desde Claude Code u otro LLM compatible, sin abrir el browser.

### Instalacion

```bash
bun run setup:mcp
```

Esto configura el MCP server de forma **global** en `~/.claude/settings.json`. Reinicia Claude Code y las herramientas quedan disponibles en **todos** tus proyectos.

Para ejecutar el servidor MCP manualmente (debug):

```bash
bun run mcp
```

### Herramientas disponibles

| Tool | Descripcion |
|---|---|
| `list_flows` | Lista flujos configurados y settings |
| `create_flow` | Crea un flujo nuevo en flows.yaml |
| `update_flow` | Modifica un flujo existente |
| `delete_flow` | Elimina un flujo de flows.yaml |
| `simulate_flow` | Info para disparar simulacion en clientes conectados |
| `list_services` | Servicios Docker con estado, imagen, puertos |
| `get_stats` | CPU/memoria por servicio |
| `get_logs` | Ultimas N lineas de logs de un container |
| `get_connections` | Conexiones detectadas entre servicios |
| `start_dashboard` | Arranca el servidor dev (Vite + backend) |
| `stop_dashboard` | Para el servidor dev |

### Uso desde Claude Code

Una vez configurado, las herramientas estan disponibles directamente. Ejemplos:

- "Arranca el dashboard en modo dev"
- "Lista los servicios Docker corriendo"
- "Muestra los logs del container abc123"
- "Crea un flujo llamado api_request que pase por nginx, backend y db"
- "Cuanto CPU esta usando cada servicio?"
- "Para el dashboard"

## Stack

| Componente | Tecnologia |
|---|---|
| Runtime | Bun |
| Server | Hono |
| Frontend | React 19 + Vite 6 |
| Grafos | @xyflow/react 12 |
| Estilos | Tailwind CSS 4 |
| Iconos | Lucide React |
| Docker API | dockerode |
| Comunicacion | WebSocket nativo |

## Estructura

```
src/
  server/
    index.ts        — servidor Hono + WebSocket + CLI args
    docker.ts       — descubrimiento de servicios y conexiones
    watcher.ts      — polling de stats + stream de eventos Docker
    mcp.ts          — servidor MCP (stdio) para Claude Code
  client/
    App.tsx          — dashboard principal + login screen
    main.tsx         — entry point React
    index.css        — Tailwind + animaciones custom
    nodes/
      ServiceNode.tsx — nodo visual por container
      GroupNode.tsx    — header de grupo (proyecto/compose)
    hooks/
      useDocker.ts   — hook WebSocket para datos en tiempo real
    engine/
      layout.ts      — layout de grupos + grid + edges
      particles.ts   — motor de particulas (spawn, tick, pausa en nodos)
    components/
      ParticleOverlay.tsx — renderizado SVG de particulas sobre edges
    panels/
      LogPanel.tsx   — panel de logs por container
      FlowPanel.tsx  — panel de simulacion de flujos
  shared/
    types.ts         — tipos compartidos server/client
flows.yaml           — configuracion de flujos (opcional)
```

## Licencia

Copyright (C) 2026 Jorge Gonzalez D. (RGJorge)

Este proyecto esta licenciado bajo **GNU Affero General Public License v3.0** (AGPL-3.0). Ver el archivo [LICENSE](LICENSE) para los terminos completos.

Para uso comercial con codigo cerrado, contactar al autor para una licencia comercial.
