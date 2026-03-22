# 05 — React Flow + Auto-Layout + Agrupación

## Objetivo
Montar el canvas de React Flow con auto-layout (dagre) y subgraphs por proyecto/compose file.

## Tareas
- [ ] `src/client/App.tsx`:
  - React Flow con Background, Controls, MiniMap
  - Dark theme (bg-slate-950, minimap dark)
  - fitView al cargar
- [ ] `src/client/engine/layout.ts`:
  - Auto-layout con dagre respetando grupos
  - Nodos dentro de su grupo (parentId)
  - Posicionamiento que no se solape
- [ ] Agrupación automática:
  - `detectGrouping()`: si hay 1 proyecto → agrupa por compose_file, si hay múltiples → agrupa por project
  - Nodos "group" de React Flow con borde dashed, label, fondo semi-transparente
  - Colores distintos por grupo
- [ ] Edges entre nodos:
  - Usa connections del backend
  - Label con tipo de conexión (postgres, cache, upstream, broker)
  - Estilo: línea sólida gris con label
- [ ] Conectar useDocker hook → actualizar nodos/edges en tiempo real

## Criterio de completado
Dashboard muestra todos los containers agrupados por proyecto/compose file, con edges entre ellos, auto-layout limpio, minimap, zoom y pan.
