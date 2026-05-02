# Dockerflow (Flowteon)

## Nomenclatura UI

- **Nodo** — tarjeta de servicio en el canvas (`ServiceNode.tsx`)
- **Panel** — panel lateral izquierdo con detalles del servicio (`DetailPanel.tsx`)
- **Canvas** — mesa de trabajo donde se ven los nodos y conexiones (ReactFlow)

## Stack

- **Frontend:** React + ReactFlow + Tailwind CSS
- **Backend:** Hono + Bun
- **Docker:** dockerode para comunicacion con Docker API

## Estructura

- `src/client/` — frontend React
  - `nodes/` — componentes de nodos (ServiceNode, GroupNode)
  - `panels/` — paneles (DetailPanel)
  - `hooks/` — hooks (useDocker)
  - `engine/` — layout
  - `components/` — componentes generales
- `src/server/` — backend Hono
  - `index.ts` — servidor principal, WebSocket, API REST
  - `docker.ts` — interaccion con Docker
  - `watcher.ts` — polling de stats y eventos
- `src/shared/` — tipos compartidos

## Comandos

- `bun run dev` — desarrollo (servidor + cliente)
- `bun run build` — build de produccion
