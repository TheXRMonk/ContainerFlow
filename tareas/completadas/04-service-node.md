# 04 — ServiceNode (nodo visual de container)

## Objetivo
Crear el componente visual que representa cada container en el grafo.

## Tareas
- [ ] `src/client/nodes/ServiceNode.tsx`:
  - Status dot con animate-pulse (running = verde, stopped = rojo, paused = amarillo)
  - Icono auto-detectado por imagen (postgres=🐘, redis=⚡, nginx=🔀, node=💚, python=🐍, etc.)
  - Nombre del servicio
  - Imagen (truncada)
  - Puertos como badges cyan
  - Barras de CPU/MEM con porcentaje
  - Badge del proyecto (compose project name)
  - Handles top/bottom para edges
  - Dark theme: bg slate-900, bordes según estado, backdrop-blur
- [ ] Registrar nodeTypes en React Flow
- [ ] Probar con datos mock primero

## Criterio de completado
Se ven nodos bonitos con toda la info, pulso verde en running, rojo en stopped.
