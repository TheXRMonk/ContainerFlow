# 01 — Project Setup

## Objetivo
Inicializar el proyecto con Bun, TypeScript, Vite, React y todas las dependencias.

## Tareas
- [ ] `bun init` con TypeScript
- [ ] `package.json` con scripts: `dev`, `build`, `start`
- [ ] `tsconfig.json` para server (Node/Bun) y client (React)
- [ ] `vite.config.ts` con React plugin y proxy al server
- [ ] Instalar dependencias:
  - Server: `hono`, `dockerode`, `yaml`, `zod`
  - Client: `react`, `react-dom`, `@xyflow/react`, `@dagrejs/dagre`
  - Dev: `typescript`, `vite`, `@vitejs/plugin-react`, `tailwindcss`, `@types/dockerode`
- [ ] Crear estructura de carpetas:
  ```
  src/
  ├── server/
  ├── client/
  └── shared/
  ```
- [ ] Verificar que `bun run dev` arranca sin errores

## Criterio de completado
`bun run dev` levanta el server Hono en :9470 y sirve una página React vacía.
