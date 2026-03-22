# 06 — Filtrado de Proyectos (CLI + Frontend)

## Objetivo
Permitir filtrar qué proyectos se muestran, tanto por CLI como por dropdown en el frontend.

## Tareas
- [ ] CLI args en `src/server/index.ts`:
  - `--all` → carga todos los containers
  - `--projects=name1,name2` → filtra por com.docker.compose.project
  - Sin flags → auto-detecta por `path.basename(process.cwd())`
  - Filtro aplicado en `discoverServices()`
- [ ] `src/client/panels/ProjectFilter.tsx`:
  - Dropdown con checkboxes por proyecto
  - "Mostrar todos" toggle
  - Selección se guarda en localStorage
  - Solo visible si hay más de 1 proyecto (si usó --all o --projects con varios)
- [ ] Filtro en el frontend:
  - Los nodos/edges se filtran en el cliente según selección
  - Transición suave al mostrar/ocultar nodos

## Criterio de completado
`bunx alteonx-dockerflow --all` muestra todos los proyectos con dropdown para filtrar.
`bunx alteonx-dockerflow` sin flags muestra solo el proyecto del directorio actual, sin dropdown.
