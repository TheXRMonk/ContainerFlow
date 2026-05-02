# Roadmap para publicar DockerFlow como Open Source

Estado actual del proyecto: **v0.1.0** | ~1,774 lineas de codigo | 0 tests | 0 CI/CD | Sin licencia formal

---

## Fase 1 — Fundamentos legales y limpieza

> Sin esto, nadie puede usar tu codigo legalmente ni contribuir con confianza.

### 1.1 Crear archivo LICENSE

- [ ] Crear `LICENSE` en la raiz con el texto completo de MIT
- [ ] El README ya dice "MIT" al final, pero sin el archivo no tiene validez legal
- [ ] Opciones alternativas si cambias de opinion:
  - **MIT** — maxima adopcion, cualquiera puede hacer lo que quiera
  - **Apache 2.0** — como MIT pero protege contra demandas de patentes
  - **GPL v3** — obliga a que los forks tambien sean open source

### 1.2 Auditar secretos en el historial de git

- [ ] Verificar que `.env` nunca fue commiteado (HECHO: confirmado limpio)
- [ ] Verificar que no hay tokens, passwords o claves hardcodeados en el codigo
- [ ] Buscar en el historial: `git log -p --all -S 'AUTH_TOKEN' -- '*.ts'`
- [ ] Buscar en el historial: `git log -p --all -S 'password' -- '*.ts'`
- [ ] Si se encuentra algo comprometido, considerar `git filter-branch` o `bfg` para limpiar

### 1.3 Eliminar archivos internos del repo publico

- [ ] Eliminar `tareas/completadas/` — son notas internas de desarrollo, no aportan al usuario final
- [ ] Eliminar `docker-project.md` — documento de planificacion interna
- [ ] Decidir sobre `PLAN-MULTI-HOST.md` — puede quedarse como roadmap publico o moverse a GitHub Issues/Projects
- [ ] Eliminar `.claude/settings.local.json` si contiene paths locales
- [ ] Actualizar `.gitignore` para excluir `tareas/` y documentos internos futuros

### 1.4 Limpiar configuracion local

- [ ] Verificar que `.dockerflow-positions.json` esta en `.gitignore` (esta)
- [ ] Verificar que `.env` esta en `.gitignore` (esta)
- [ ] Agregar a `.gitignore`: `PUBLICAR.md`, `tareas/`, `docker-project.md`

---

## Fase 2 — Documentacion para la comunidad

> La documentacion es la primera impresion. Un proyecto sin docs claras no recibe contribuciones.

### 2.1 README en ingles (idioma principal)

- [ ] Crear `README.md` en ingles como version principal
- [ ] Mover el README actual a `README.es.md` y linkear desde el principal
- [ ] Incluir en el README:
  - [ ] **Hero section**: nombre, descripcion de una linea, badges (license, version, bun)
  - [ ] **Screenshot/GIF** del dashboard funcionando (esto es CRITICO para adopcion)
  - [ ] **Quick start** en 4 lineas o menos
  - [ ] **Features** con iconos o emojis descriptivos
  - [ ] **Configuration** (tabla de env vars)
  - [ ] **Container actions** (start, stop, restart, rebuild, remove)
  - [ ] **MCP integration** (esto es diferenciador, destacarlo)
  - [ ] **Tech stack** (tabla limpia)
  - [ ] **Contributing** link
  - [ ] **License** badge + link

### 2.2 Captura de pantalla / GIF del dashboard

- [ ] Levantar el dashboard con containers de ejemplo
- [ ] Grabar un GIF de ~10 segundos mostrando:
  - Vista general con servicios conectados
  - Metricas en tiempo real (CPU/MEM)
  - Acciones sobre containers
- [ ] Herramientas recomendadas: `peek` (Linux), `gifski`, o `Kap` (macOS)
- [ ] Guardar en `docs/assets/demo.gif` y referenciar desde README
- [ ] Alternativa: screenshot estatico como fallback

### 2.3 CONTRIBUTING.md

- [ ] Crear `CONTRIBUTING.md` con:
  - [ ] Requisitos: Bun >= 1.0, Docker corriendo
  - [ ] Setup del entorno de desarrollo (`bun install && bun run dev`)
  - [ ] Estructura del proyecto (breve, linkear a README)
  - [ ] Convenciones de codigo (TypeScript estricto, sin `any`, imports absolutos)
  - [ ] Proceso de PRs: fork → branch → PR con descripcion
  - [ ] Issues: como reportar bugs, como proponer features
  - [ ] Commits: formato convencional (`feat:`, `fix:`, `docs:`)

### 2.4 CODE_OF_CONDUCT.md

- [ ] Adoptar Contributor Covenant v2.1 (estandar de la industria)
- [ ] Copiar de https://www.contributor-covenant.org/
- [ ] Personalizar email de contacto

### 2.5 CHANGELOG.md

- [ ] Crear `CHANGELOG.md` siguiendo formato Keep a Changelog
- [ ] Documentar retroactivamente las versiones existentes:
  - v0.0.1 — Setup inicial, descubrimiento Docker
  - v0.0.2 — WebSocket, metricas en tiempo real
  - v0.0.3 — Nodos visuales, layout React Flow
  - v0.0.4 — Filtro de proyectos, autenticacion
  - v0.0.5 — MCP server, logs, acciones de containers, polish
- [ ] De aqui en adelante, actualizar con cada release

---

## Fase 3 — Calidad de codigo

> Da confianza a los contribuidores y previene regresiones.

### 3.1 Configurar linter + formatter

- [ ] Instalar Biome (rapido, todo-en-uno, compatible con Bun):
  ```bash
  bun add -d @biomejs/biome
  bunx biome init
  ```
- [ ] Configurar reglas en `biome.json`:
  - Formatter: tabs/spaces, ancho de linea
  - Linter: reglas recomendadas de TypeScript + React
  - Organizar imports automaticamente
- [ ] Agregar scripts a `package.json`:
  ```json
  "lint": "biome check src/",
  "lint:fix": "biome check --write src/",
  "format": "biome format --write src/"
  ```
- [ ] Ejecutar `bun run lint:fix` una vez para normalizar todo el codigo
- [ ] Commit con mensaje: `chore: configure biome linter and format codebase`

### 3.2 Agregar tests minimos

- [ ] Usar `bun:test` (ya viene con Bun, zero config)
- [ ] Tests prioritarios:
  - [ ] `src/server/__tests__/docker.test.ts` — parseo de conexiones, deteccion de tipos
  - [ ] `src/server/__tests__/watcher.test.ts` — polling de stats, eventos Docker
  - [ ] `src/shared/__tests__/types.test.ts` — validacion de tipos con Zod si aplica
  - [ ] `src/client/engine/__tests__/layout.test.ts` — calculo de layout basico
- [ ] Agregar script: `"test": "bun test"`
- [ ] Meta inicial: cubrir la logica de negocio del server (docker.ts, watcher.ts)
- [ ] No hace falta 100% coverage, pero si que lo critico este cubierto

### 3.3 Type checking estricto

- [ ] Verificar que `bun run build` no genera errores de TypeScript
- [ ] Agregar script: `"typecheck": "tsc --noEmit"`
- [ ] Corregir cualquier error que aparezca

---

## Fase 4 — CI/CD con GitHub Actions

> Automatiza la verificacion. Cada PR debe pasar lint + tests + build.

### 4.1 Workflow de CI basico

- [ ] Crear `.github/workflows/ci.yml`:
  ```yaml
  name: CI
  on: [push, pull_request]
  jobs:
    check:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: oven-sh/setup-bun@v2
          with:
            bun-version: latest
        - run: bun install
        - run: bun run lint
        - run: bun run typecheck
        - run: bun run test
        - run: bun run build
  ```
- [ ] Verificar que pasa en la primera ejecucion
- [ ] Agregar badge de CI al README

### 4.2 (Opcional) Release automatizado

- [ ] Configurar workflow de release al pushear tags:
  ```yaml
  on:
    push:
      tags: ['v*']
  ```
- [ ] Generar GitHub Release con changelog automatico
- [ ] Considerar `changesets` o `release-please` para automatizar versiones

---

## Fase 5 — Distribucion y Docker

> Facilitar que la gente lo pruebe sin clonar el repo.

### 5.1 Dockerfile

- [ ] Crear `Dockerfile` multi-stage:
  ```dockerfile
  # Build
  FROM oven/bun:1 AS builder
  WORKDIR /app
  COPY package.json bun.lock* ./
  RUN bun install --frozen-lockfile
  COPY . .
  RUN bun run build

  # Run
  FROM oven/bun:1-slim
  WORKDIR /app
  COPY --from=builder /app/dist ./dist
  COPY --from=builder /app/src/server ./src/server
  COPY --from=builder /app/node_modules ./node_modules
  COPY --from=builder /app/package.json .
  EXPOSE 9470
  CMD ["bun", "run", "start"]
  ```
- [ ] Crear `.dockerignore` (node_modules, .git, tareas, etc.)
- [ ] Testear localmente: `docker build -t dockerflow . && docker run -v /var/run/docker.sock:/var/run/docker.sock -p 9470:9470 dockerflow`

### 5.2 docker-compose.yml de ejemplo

- [ ] Crear `docker-compose.yml` para que los usuarios levanten con un comando:
  ```yaml
  services:
    dockerflow:
      image: ghcr.io/rgjorge/dockerflow:latest
      ports:
        - "9470:9470"
      volumes:
        - /var/run/docker.sock:/var/run/docker.sock:ro
      environment:
        - AUTH_TOKEN=${AUTH_TOKEN:-}
  ```

### 5.3 Publicar imagen en GitHub Container Registry

- [ ] Crear workflow `.github/workflows/docker.yml` para build + push automatico
- [ ] Publicar en `ghcr.io/rgjorge/dockerflow`
- [ ] Tags: `latest`, `v0.1.0`, `v0.1`, `v0`
- [ ] Documentar en README el one-liner de Docker

---

## Fase 6 — Preparacion del repositorio

> Detalles finales antes de hacer el repo publico.

### 6.1 GitHub repo settings

- [ ] Descripcion del repo: "Real-time Docker architecture visualization dashboard"
- [ ] Topics: `docker`, `monitoring`, `dashboard`, `visualization`, `devtools`, `bun`, `react`, `mcp`
- [ ] Website: URL del repo o demo si la hay
- [ ] Habilitar Issues
- [ ] Habilitar Discussions (opcional, bueno para comunidad)
- [ ] Configurar branch protection en `main`:
  - Require PR reviews
  - Require status checks (CI)
  - No force push

### 6.2 Issue templates

- [ ] Crear `.github/ISSUE_TEMPLATE/bug_report.md`
- [ ] Crear `.github/ISSUE_TEMPLATE/feature_request.md`
- [ ] Crear `.github/PULL_REQUEST_TEMPLATE.md`

### 6.3 Issues iniciales como roadmap publico

- [ ] Crear issues con label `good first issue` para atraer contribuidores:
  - "Add dark/light theme toggle"
  - "Support podman as alternative to Docker"
  - "Add container restart/stop actions from UI"
  - "Export dashboard as PNG/SVG"
- [ ] Crear issues con label `enhancement` del roadmap:
  - "Multi-host Docker monitoring (TCP/TLS)"
  - "Container health check visualization"
  - "Custom node colors/icons per service type"
- [ ] Convertir `PLAN-MULTI-HOST.md` en un issue detallado

### 6.4 Crear GitHub Release v0.1.0

- [ ] Tag: `v0.1.0`
- [ ] Titulo: "DockerFlow v0.1.0 — Initial Public Release"
- [ ] Body: features principales, screenshot, instrucciones de instalacion
- [ ] Esto reemplaza los tags internos v0.0.x

---

## Fase 7 — Lanzamiento y difusion

> El codigo listo no sirve si nadie lo ve.

### 7.1 Preparar assets de lanzamiento

- [ ] GIF/screenshot de alta calidad del dashboard
- [ ] Descripcion corta (1 parrafo) para copiar/pegar en redes
- [ ] Lista de features destacadas (3-5 bullet points)

### 7.2 Publicar en comunidades

- [ ] **Reddit**: r/selfhosted, r/docker, r/devops, r/opensource
  - Titulo sugerido: "I built a real-time Docker architecture visualizer with live metrics"
  - Incluir GIF y link al repo
- [ ] **Hacker News**: Show HN post
  - Titulo: "Show HN: Flowteon – Real-time Docker architecture visualization"
- [ ] **Twitter/X**: Thread con GIF y features
- [ ] **Dev.to**: Articulo sobre como se construyo
- [ ] **Discord**: Servidores de Docker, Bun, React
- [ ] **Product Hunt**: Si quieres traccion con publico mas amplio

### 7.3 Post-lanzamiento

- [ ] Monitorear issues y PRs las primeras 48-72 horas
- [ ] Responder rapidamente a las primeras contribuciones (esto define la cultura)
- [ ] Agregar un "Star History" badge al README despues de ganar traccion
- [ ] Considerar crear un sitio web/landing page si hay interes

---

## Orden de ejecucion recomendado

| Prioridad | Tarea | Esfuerzo | Impacto |
|-----------|-------|----------|---------|
| 1 | Licencia MIT | 5 min | Critico |
| 2 | Limpiar archivos internos | 10 min | Alto |
| 3 | Screenshot/GIF del dashboard | 20 min | Critico |
| 4 | README en ingles | 1-2 hrs | Critico |
| 5 | CONTRIBUTING + CODE_OF_CONDUCT | 30 min | Alto |
| 6 | Biome linter + format | 30 min | Medio |
| 7 | Tests minimos (bun:test) | 2-3 hrs | Alto |
| 8 | GitHub Actions CI | 30 min | Alto |
| 9 | Dockerfile + compose | 1 hr | Alto |
| 10 | CHANGELOG retroactivo | 30 min | Medio |
| 11 | Issue templates + good first issues | 30 min | Medio |
| 12 | GitHub Release v0.1.0 | 15 min | Alto |
| 13 | Difusion en comunidades | 1-2 hrs | Critico |

**Tiempo total estimado: 8-12 horas de trabajo**

---

## Checklist final antes de hacer publico

- [ ] `LICENSE` existe y es MIT
- [ ] No hay secretos en el codigo ni en el historial de git
- [ ] No hay archivos internos/personales en el repo
- [ ] README en ingles con screenshot/GIF
- [ ] CONTRIBUTING.md existe
- [ ] Al menos 1 test pasa
- [ ] `bun run build` funciona sin errores
- [ ] CI pasa en verde
- [ ] GitHub Release creada
- [ ] Listo para compartir el link
