# Mejoras Frontend - Flowteon

## Documentacion @xyflow/react 12

| Recurso | URL |
|---------|-----|
| **Docs principal** | https://reactflow.dev/learn |
| **API Reference** | https://reactflow.dev/api-reference |
| **Ejemplos** | https://reactflow.dev/examples |
| **UI Components** | https://reactflow.dev/ui |
| **Playground** | https://xyflow.com/labs/react-flow-playground |
| **GitHub** | https://github.com/xyflow/xyflow |
| **Migracion a v12** | https://reactflow.dev/learn/troubleshooting/migrate-to-v12 |
| **npm** | https://www.npmjs.com/package/@xyflow/react |

### Secciones clave de la documentacion

- **Learn > Core Concepts** — terms, building flows, interactivity, viewport, components
- **Learn > Customization** — custom nodes, handles, edges, labels, theming
- **Learn > Layouting** — overview, sub-flows
- **Learn > Advanced** — hooks, accessibility, testing, TypeScript, performance, state management
- **Reference > Hooks** — useNodes, useEdges, useReactFlow, etc.
- **Reference > Components** — Background, Controls, Handles, MiniMap, etc.
- **Reference > Utilities** — addEdge, applyNodeChanges, path functions

---

## Ejemplos relevantes para Flowteon

### Nodos

| Ejemplo | URL | Aplicacion en Flowteon |
|---------|-----|------------------------|
| Custom Nodes | https://reactflow.dev/examples/nodes/custom-node | Ya usamos ServiceNode y GroupNode custom |
| Node Toolbar | https://reactflow.dev/examples/nodes/node-toolbar | Agregar toolbar con acciones (restart, stop, logs) al seleccionar un container |
| Node Resizer | https://reactflow.dev/examples/nodes/node-resizer | Permitir redimensionar grupos manualmente |
| Updating Nodes | https://reactflow.dev/examples/nodes/update-node | Referencia para actualizar stats en tiempo real |
| Stress Test | https://reactflow.dev/examples/nodes/stress | Benchmark con muchos containers |
| Intersections | https://reactflow.dev/examples/nodes/intersections | Detectar overlaps entre nodos |

### Edges

| Ejemplo | URL | Aplicacion en Flowteon |
|---------|-----|------------------------|
| Animating Edges | https://reactflow.dev/examples/edges/animating-edges | Mejorar animaciones de particulas en edges |
| Custom Edges | https://reactflow.dev/examples/edges/custom-edges | Ya usamos OffsetEdge custom |
| Edge Label Renderer | https://reactflow.dev/examples/edges/edge-label-renderer | Mostrar tipo de conexion (db, cache, proxy) como label en el edge |
| Floating Edges | https://reactflow.dev/examples/edges/floating-edges | Handles que se mueven con el edge en vez de posicion fija |
| Simple Floating Edges | https://reactflow.dev/examples/edges/simple-floating-edges | Alternativa mas simple — edges al handle mas cercano |
| Edge Markers | https://reactflow.dev/examples/edges/markers | Agregar flechas direccionales a las conexiones |
| Edge Toolbar | https://reactflow.dev/examples/edges/edge-toolbar | Mostrar info de conexion al hacer hover/click en un edge |

### Interaccion

| Ejemplo | URL | Aplicacion en Flowteon |
|---------|-----|------------------------|
| Context Menu | https://reactflow.dev/examples/interaction/context-menu | Click derecho en container → restart, stop, logs, inspect |
| Contextual Zoom | https://reactflow.dev/examples/interaction/contextual-zoom | Mostrar mas detalle (ports, stats) solo cuando hay zoom suficiente |
| Save and Restore | https://reactflow.dev/examples/interaction/save-and-restore | Ya tenemos posiciones persistidas, pero podriamos guardar/cargar layouts completos |
| Validation | https://reactflow.dev/examples/interaction/validation | Validar conexiones manuales si agregamos esa funcionalidad |
| Touch Device | https://reactflow.dev/examples/interaction/touch-device | Soporte para tablets/touch |

### Layout

| Ejemplo | URL | Aplicacion en Flowteon |
|---------|-----|------------------------|
| Dagre Tree | https://reactflow.dev/examples/layout/dagre | Ya tenemos dagre en package.json pero no lo usamos — alternativa a nuestro layout manual |
| Elkjs Tree | https://reactflow.dev/examples/layout/elkjs | Layout mas potente que dagre, reduce cruces de edges |
| Horizontal Flow | https://reactflow.dev/examples/layout/horizontal | Layout horizontal (izquierda a derecha) como alternativa |
| Node Collisions | https://reactflow.dev/examples/layout/node-collisions | Resolver overlaps automaticamente al mover nodos |

### Subflows y Agrupacion

| Ejemplo | URL | Aplicacion en Flowteon |
|---------|-----|------------------------|
| Sub Flows | https://reactflow.dev/examples/grouping/sub-flows | Referencia para nuestros GroupNode — grafos anidados |

### Estilos

| Ejemplo | URL | Aplicacion en Flowteon |
|---------|-----|------------------------|
| Dark Mode | https://reactflow.dev/examples/styling/dark-mode | Toggle dark/light mode |
| Tailwind | https://reactflow.dev/examples/styling/tailwind | Ya usamos Tailwind — referencia de estilos |
| Turbo Flow | https://reactflow.dev/examples/styling/turbo-flow | Nodos con bordes gradient animados — inspiracion visual |

### Misc

| Ejemplo | URL | Aplicacion en Flowteon |
|---------|-----|------------------------|
| Download Image | https://reactflow.dev/examples/misc/download-image | Exportar el diagrama como PNG para documentacion |

---

## Mejoras identificadas

### Criticas

- [ ] **Error boundaries** — Un crash en un nodo tumba toda la app. Agregar React error boundary alrededor de ReactFlow
- [ ] **Empty state** — Si no hay containers, mostrar mensaje "No containers found" en vez de canvas vacio
- [ ] **Reconnection feedback** — Mostrar "Reconnecting..." visible cuando se pierde el WebSocket

### UX

- [ ] **Context menu** — Click derecho en container: restart, stop, view logs, copy ID
- [ ] **Node toolbar** — Al seleccionar un nodo, mostrar acciones rapidas arriba del nodo
- [ ] **Contextual zoom** — Mostrar ports y stats detallados solo con zoom > 0.8, ocultar en zoom out
- [ ] **Edge labels** — Mostrar tipo de conexion (Database, Cache, Proxy) como label en cada edge
- [ ] **Edge markers** — Flechas direccionales para indicar flujo de datos
- [ ] **Download image** — Boton para exportar diagrama como PNG
- [ ] **Search/filter** — Buscar containers por nombre dentro del canvas

### Performance

- [ ] **Virtualizacion de logs** — LogPanel renderiza 2000 lineas de golpe. Usar virtualizacion (react-window o similar)
- [ ] **Reconnexion exponencial** — Backoff exponencial en vez de intervalo fijo 3s
- [ ] **Validacion de mensajes WS** — Validar estructura de mensajes con Zod antes de procesar

### Layout

- [ ] **Auto-layout con dagre/elkjs** — Usar la dependencia dagre que ya tenemos o migrar a elkjs para layout automatico
- [ ] **Collision detection** — Resolver overlaps automaticamente al mover nodos
- [ ] **Layout horizontal** — Opcion de layout izquierda-derecha ademas del actual

### Visual

- [ ] **Transiciones de layout** — Animar nodos cuando aparecen/desaparecen
- [ ] **Turbo-style glow** — Bordes con gradient animado para containers running
- [ ] **Dark/light mode** — Toggle de tema (actualmente solo dark)

### Accesibilidad

- [ ] **ARIA labels** — Agregar labels a botones de solo icono
- [ ] **Keyboard navigation** — Navegar entre nodos con teclado
- [ ] **Touch support** — Handles mas grandes para dispositivos tactiles

---

## Componentes UI de React Flow

React Flow lanzo "React Flow UI" (antes "React Flow Components") — componentes pre-hechos instalables via shadcn CLI:

- **Database Schema Node** — Visualizar tablas y relaciones
- **Zoom Slider** — Control de zoom mas visual que los botones default
- **Debug Components** — Inspeccionar propiedades de nodos y estado del flow

Docs: https://reactflow.dev/ui
