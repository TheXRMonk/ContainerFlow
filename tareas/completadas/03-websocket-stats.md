# 03 — WebSocket + Stats + Docker Events

## Objetivo
Enviar datos en tiempo real al frontend via WebSocket: servicios, stats y eventos Docker.

## Tareas
- [ ] `src/server/watcher.ts` — `pollStats()`:
  - CPU y MEM por container (solo running)
  - Calcula cpu_percent, mem_mb, mem_percent
- [ ] `src/server/watcher.ts` — `watchDockerEvents()`:
  - Stream de Docker events API
  - Filtra por Type: "container"
  - Emite: start, stop, die, restart, health_status
- [ ] WebSocket en `src/server/index.ts`:
  - Bun.serve con websocket handler
  - `broadcast()` a todos los clients conectados
  - Polling de services + connections + stats cada 3s
  - Docker events en tiempo real
- [ ] `src/client/hooks/useDocker.ts`:
  - Hook que conecta al WebSocket
  - Mantiene estado de services, connections, stats, events

## Criterio de completado
Abrir el dashboard, la consola del browser muestra datos llegando por WebSocket cada 3s.
