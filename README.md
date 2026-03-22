# DockerFlow AlteonX

Visualizador en tiempo real de arquitecturas Docker. Muestra servicios, conexiones y metricas de todos tus proyectos Docker Compose en un dashboard interactivo.

## Requisitos

- [Bun](https://bun.sh) >= 1.0
- Docker corriendo con acceso al socket (`/var/run/docker.sock`)

## Instalacion

```bash
git clone https://github.com/RGJorge/alteonx-dockerflow.git
cd alteonx-dockerflow
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
- **Leyenda de conexiones** — colores por tipo: Database (azul), Cache (rojo), Broker (naranja), Proxy (verde)
- **Grupos visuales** — recuadros por proyecto/compose con titulo, archivo compose y conteo de containers
- **Tooltips** — hover sobre cada nodo para ver estado, imagen, ID y puertos

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
  shared/
    types.ts         — tipos compartidos server/client
```

## Licencia

MIT
