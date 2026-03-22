# 02 — Docker Auto-Discovery

## Objetivo
Leer containers, redes y stats desde el Docker socket. Detectar conexiones automáticamente.

## Tareas
- [ ] `src/server/docker.ts` — `discoverServices()`:
  - Lee `docker.listContainers({ all: true })`
  - Extrae: name, image, state, status, ports, networks, project, compose_file
- [ ] `src/server/docker.ts` — `discoverConnections()`:
  - Lee redes y detecta qué containers comparten red
  - Genera edges entre pares de containers en la misma red
- [ ] `src/server/docker.ts` — `inferEdgeType()`:
  - Heurísticas: postgres/mysql → "database", redis → "cache", nginx/traefik → "proxy", rabbit/kafka → "broker"
- [ ] `src/shared/types.ts` — tipos compartidos: `Service`, `Connection`, `EdgeType`, `Stats`
- [ ] Endpoint REST: `GET /api/services` y `GET /api/connections`
- [ ] Probar que detecta correctamente los containers de ninjasagacw

## Criterio de completado
`curl http://localhost:9470/api/services` retorna JSON con todos los containers corriendo.
`curl http://localhost:9470/api/connections` retorna las conexiones detectadas.
