# ContainerFlow

[![CI](https://github.com/RGJorge/containerflow/actions/workflows/ci.yml/badge.svg)](https://github.com/RGJorge/containerflow/actions/workflows/ci.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
![Version](https://img.shields.io/badge/version-v0.1.0-green)
![Docker Required](https://img.shields.io/badge/Docker-required-blue?logo=docker)
![Bun](https://img.shields.io/badge/runtime-Bun-f9f1e1?logo=bun)
[![Last Commit](https://img.shields.io/github/last-commit/RGJorge/containerflow)](https://github.com/RGJorge/containerflow/commits/main)

Real-time Docker architecture visualizer. Displays services, connections and metrics from all your Docker Compose projects in an interactive dashboard.

![ContainerFlow demo](docs/demo.gif)

## Requisitos

- [Bun](https://bun.sh) >= 1.0
- Docker corriendo con acceso al socket (`/var/run/docker.sock`)

## Instalacion

```bash
git clone https://github.com/RGJorge/containerflow.git
cd containerflow
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
| `DATA_DIR` | _(cwd)_ | Directorio para persistencia: SQLite de historial (`.dockerflow-stats.db`), config Discord (`.dockerflow-discord.json`) y overrides por contenedor (`.dockerflow-container-settings.json`) |

## Uso

### Desarrollo (hot reload)

```bash
bun run dev
```

Abre `http://localhost:9420` (Vite dev con hot reload, proxea API al backend en puerto 9470).

### Produccion (Docker)

```bash
docker compose up -d
```

Abre `http://localhost:9470`.

### Produccion (manual)

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
- **Panel de detalle** — click en un container para ver info, stats, variables de entorno y configuracion en tabs separados
- **Logs de containers** — logs en tiempo real con scroll automatico, filtro por stream (stdout/stderr) y opcion de copiar
- **Acciones sobre containers** — start, stop, restart, rebuild y remove directamente desde el panel
- **Filtro de proyectos** — dropdown para mostrar/ocultar proyectos, persiste entre sesiones
- **Autenticacion** — pantalla de login con AUTH_TOKEN para acceso remoto seguro
- **Leyenda de conexiones** — colores por tipo: Database (azul), Cache (rojo), Broker (naranja), Proxy (verde)
- **Grupos visuales** — recuadros por proyecto/compose con titulo, archivo compose y conteo de containers
- **Menu contextual** — click derecho en un nodo para acciones rapidas
- **Pagina de monitoring** — historial de CPU/RAM por servicio (1h, 6h, 24h, 7d) persistido en SQLite, gráficas con sparkline, expand por contenedor, filtros por proyecto/servicio y feed de eventos Docker
- **Notificaciones Discord** — webhook configurable que avisa cambios de estado, alertas de recursos, acciones manuales y errores
- **Umbrales por contenedor** — overrides personalizados de CPU/MEM (con fallback a umbrales globales) y toggle de notificaciones por servicio
- **Pagina de settings** — configuracion de la aplicacion (auth, Discord, hosts Docker)

## Monitoreo e historial

ContainerFlow guarda un historial de métricas y notifica eventos importantes a Discord.

### Historial de métricas

- **Persistencia** — stats de CPU y memoria se almacenan en SQLite (`.dockerflow-stats.db`) cada vez que se hace polling de Docker (~3s)
- **Rangos** — `1h`, `6h`, `24h`, `7d` con buckets agregados (30s / 60s / 5min / 30min) para rendimiento
- **Retención** — auto-limpieza horaria descarta datos con más de 7 días y compacta la base con `VACUUM`
- **API** —
  - `GET /api/stats/history?range=1h` — historial de todos los servicios
  - `GET /api/stats/history/:uid?range=1h` — historial de un servicio específico
- **UI** — la página de monitoring (`MonitoringPage.tsx`) muestra una tarjeta por servicio con sparkline de CPU y MEM, valor actual, promedio y línea de umbral. Cada tarjeta puede expandirse para ver una gráfica más grande, y se filtra por proyecto y/o servicio (los filtros son acumulativos).

### Notificaciones Discord

Configurables desde **Settings → Discord Notifications**. Requiere un webhook URL que empiece por `https://discord.com/api/webhooks/`.

Eventos soportados (cada uno se puede activar/desactivar):

| Evento | Cuándo dispara |
|---|---|
| **Container State Changes** | `start`, `stop`, `die` (crash), `restart`, `health_status`. Los eventos `stop`/`die` se debouncean 15s para detectar reinicios y enviar un solo mensaje "Container Restarted" en lugar de stop+start separados |
| **Resource Alerts** | CPU o memoria de un contenedor supera el umbral (global o por-container) |
| **UI Actions** | Acción manual disparada desde el panel: start/stop/restart/rebuild/remove |
| **Action Errors** | Falló una acción ejecutada desde la UI (incluye el mensaje de error) |

Mecanismos anti-spam:

- **Cooldown global** — minutos mínimos entre alertas del mismo tipo+servicio (default `5 min`, configurable `1-60`)
- **Down reminder** — si un contenedor sigue caído, reenvía un recordatorio "Container Still Down" cada N minutos (default `5 min`)
- **Cola con rate limit** — 500ms mínimo entre webhooks; si Discord responde `429`, respeta el `Retry-After` y reintenta
- **Debounce de stop/die** — buffer de 15s para colapsar restart/redeploy en una sola notificación

Umbrales:

- **Globales** — CPU% y MEM% en Settings (default 50% / 60%)
- **Por contenedor** — desde la página de monitoring, click en el ícono ⚙️ de un servicio para abrir el panel inline. Permite:
  - Activar/desactivar notificaciones para ese contenedor
  - Override del umbral de CPU (drag del slider)
  - Override del umbral de memoria
  - Reset al valor global (X)
  - Los overrides se persisten en `.dockerflow-container-settings.json` y se auto-guardan con debounce de 400ms

Botón **Test** en Settings envía un embed de prueba al webhook para verificar que funciona antes de habilitarlo.

## Tests

El proyecto usa [Vitest](https://vitest.dev/) para tests unitarios.

```bash
# Correr todos los tests
bun run test

# Correr en modo watch (re-ejecuta al guardar)
bun run test:watch

# Verificar tipos TypeScript
bun run typecheck
```

Los tests cubren:

- **Logica de processing** (`src/client/hooks/processing.test.ts`) — sincronizacion de estados cuando se ejecutan acciones sobre containers (start/stop/restart), incluyendo manejo de estados crashed/dead, timeouts y minDuration
- **Deteccion de conexiones** (`src/server/docker.test.ts`) — descubrimiento de relaciones entre servicios por red compartida, clasificacion de servicios (infra, proxy, worker) y deduplicacion

## CI

GitHub Actions ejecuta automaticamente en cada push/PR a `main`:

1. Typecheck (errores de tipos)
2. Tests (Vitest)
3. Build (produccion)

Ver `.github/workflows/ci.yml`.

## Seguridad

- **HTTPS obligatorio en produccion** — el token de autenticacion viaja en headers HTTP. Sin HTTPS, es texto plano visible en la red. Usa un reverse proxy con TLS (nginx, Caddy, Cloudflare Tunnel) delante de ContainerFlow.
- **Rate limiting** — incluido por defecto: 5 intentos fallidos por minuto por IP. Despues del limite, retorna `429 Too Many Requests`. Aplica tanto a la API REST como a la autenticacion WebSocket.
- **Acceso local por defecto** — sin `AUTH_TOKEN`, el servidor solo escucha en `127.0.0.1`. Con `AUTH_TOKEN`, escucha en `0.0.0.0` para acceso remoto.

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
| Tests | Vitest |

## Estructura

```
src/
  server/
    index.ts             — servidor Hono + WebSocket + CLI args + REST API
    docker.ts            — descubrimiento de servicios y conexiones
    watcher.ts           — polling de stats + stream de eventos Docker
    stats-db.ts          — SQLite de historial de stats (insert, query por rango, cleanup 7d)
    discord.ts           — webhooks Discord (state changes, resource alerts, cooldown, debounce, queue)
    container-settings.ts — overrides por contenedor (umbrales y toggle de notificaciones)
  client/
    App.tsx          — dashboard principal + login screen
    main.tsx         — entry point React
    index.css        — Tailwind + animaciones custom
    nodes/
      ServiceNode.tsx — nodo visual por container
      GroupNode.tsx    — header de grupo (proyecto/compose)
    hooks/
      useDocker.ts        — hook WebSocket para datos en tiempo real
      useStatsHistory.ts  — fetch del historial de stats por rango (1h/6h/24h/7d)
      useStatsStore.ts    — store en memoria para stats live
      processing.ts       — logica pura de estados processing
    engine/
      layout.ts      — layout de grupos + grid + edges
    components/
      HeaderBar.tsx      — barra superior con navegacion
      EdgeLegend.tsx     — leyenda de tipos de conexion
      LoginScreen.tsx    — pantalla de autenticacion
      NodeContextMenu.tsx — menu contextual de nodos
      OffsetEdge.tsx     — edge custom con offset para evitar superposicion
      Sparkline.tsx      — gráfica de línea ligera para historial de stats
      StatsCard.tsx      — tarjeta de métrica con sparkline, hover, promedio y umbral
      ThresholdBar.tsx   — slider de umbral por contenedor con override/reset
    panels/
      DetailPanel.tsx — panel lateral con info, stats, env, config y logs
      LogPanel.tsx    — panel de logs por container
    pages/
      MonitoringPage.tsx — historial de CPU/RAM, eventos Docker y umbrales por contenedor
      SettingsPage.tsx   — configuracion (auth, Discord webhook, eventos, umbrales globales)
  shared/
    types.ts         — tipos compartidos server/client
```

## Licencia

Copyright (C) 2026 Jorge Gonzalez D. (RGJorge)

Este proyecto esta licenciado bajo **GNU Affero General Public License v3.0** (AGPL-3.0). Ver el archivo [LICENSE](LICENSE) para los terminos completos.

Para uso comercial con codigo cerrado, contactar para una licencia comercial: alteonx.servicios@gmail.com
