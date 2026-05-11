# ContainerFlow — Roadmap de Monitoreo

> Actualizado tras integración de eventos persistentes, notificaciones in-app,
> control de acceso por path y corrección de cálculo de memoria real.

## Fase 1: Acciones básicas ✅ COMPLETA
- [x] Stop / Start / Restart desde el DetailPanel
- [x] Confirmación antes de ejecutar acciones destructivas (stop/restart/remove/rebuild/recreate)
- [x] Feedback visual del estado de la acción (loading, success, error) — toast top-right con copy/expand
- [x] Rebuild (docker compose up --build) por servicio
- [x] **Bonus**: Recreate (docker compose up --force-recreate) para aplicar cambios de compose sin rebuild

## Fase 2: Notificaciones ✅ MAYORMENTE COMPLETA
- [x] Webhooks configurables — **Discord implementado**, Slack pendiente (mismo patrón aplicaría)
- [ ] PWA — Service Worker + manifest (no implementado, depende de habilitar PWA web notifications)
- [x] Push notifications cuando un contenedor cae o health check falla — vía Discord + in-app
- [x] Panel de configuración de notificaciones en la UI (SettingsPage → Discord section)
- [x] **Bonus**: Notificaciones in-app (SQLite persistente, bell del header con read/unread, tab dedicado en Monitoring)
- [x] **Bonus**: Debounce de 15s para detectar restart vs stop+start
- [x] **Bonus**: Cooldown configurable + "Still Down" reminder

## Fase 3: Historial y métricas ✅ COMPLETA
- [x] SQLite para persistir stats — CPU/RAM (network I/O pendiente)
- [x] Gráficas temporales de CPU/RAM por servicio (1h, 6h, 24h, 7d) con buckets agregados
- [x] Dashboard de métricas agregadas — MonitoringTotalsCard (CPU/MEM total por filtro)
- [x] Retención configurable — 7d default, auto-limpieza horaria + VACUUM
- [x] **Bonus**: Filtro per-servicio en monitoring (override del range global)
- [x] **Bonus**: Filtros por proyecto/servicio con botón reset
- [x] **Bonus**: Cálculo de memoria real (resta page cache active+inactive, no solo inactive como `docker stats`)

## Fase 4: Alertas ✅ MAYORMENTE COMPLETA
- [ ] Reglas de alertas con duración (ej: CPU > 80% **por 5 min**) — parcialmente: alertas inmediatas al cruzar threshold, no soporte de duración sostenida
- [x] Historial de alertas disparadas — notifications_log en SQLite, tab Notificaciones
- [x] Integración con notificaciones (Fase 2) — Discord + in-app
- [x] Alertas por health check fallido — vía `health_status` event
- [x] **Bonus**: Thresholds por contenedor con override del global (CPU% y MEM%)
- [x] **Bonus**: Color amber en progress bars cuando supera threshold (dashboard ServiceNode + DetailPanel)

## Fase 5: Info avanzada
- [ ] Volumes/Mounts por contenedor en DetailPanel (no implementado)
- [x] Terminal interactiva (docker exec) desde la UI — botón Exec en DetailPanel
- [ ] Network inspector (tráfico entre servicios) — parcial: conexiones visualizadas en grafo, no hay info de tráfico
- [ ] Image layers y tamaño (no implementado)

## Fase 6: Deployment (futuro)
- [ ] GitHub integration (webhook + clone + build)
- [ ] Build pipeline (docker build desde Dockerfile)
- [ ] Deploy management (docker-compose dinámico)
- [ ] Domain routing automático (Traefik/Caddy)
- [ ] Rollbacks (mantener imágenes anteriores)
- [ ] Env var editing + rebuild desde la UI — parcial: env vars visibles en DetailPanel, edición pendiente

---

## Features adicionales no contempladas en el roadmap original

### Seguridad / Multi-usuario
- [x] `ALLOWED_PATHS` env var para limitar acciones a paths específicos
- [x] `ALLOW_NON_COMPOSE` para containers `docker run` directo
- [x] Lock icon visual en nodos sin acceso de acción
- [x] Sección "Seguridad" expandida en README (privilegios del container, multi-user, ALLOWED_PATHS)

### UX / DX
- [x] Tooltips descriptivos en acciones (DetailPanel + NodeContextMenu)
- [x] Confirmación dialogs con (?) que muestra detalle del comando
- [x] Acción labels siempre en inglés (Restart/Stop/Recreate — match docker commands)
- [x] Hot stats al cargar página (`/api/init` devuelve último snapshot cacheado)
- [x] Polling paralelo (Promise.all) — primera ronda en ~3s vs ~90s antes
- [x] Tabs en Monitoring (Historial / Eventos / Notificaciones)
- [x] Click en notificación/evento → abre DetailPanel del container en tab Stats
- [x] DATA_DIR auto-creado en `./data/` (en vez de raíz del proyecto)

### Documentación
- [x] `docker-containerflow.md` — guía Docker explicada para usuarios
- [x] `.env.example` con secciones documentadas
- [x] README con sección Monitoreo e historial + Seguridad expandida

---

## Pendientes prioritarios (próxima iteración sugerida)

1. **Alertas con duración** ("CPU > 80% por 5 min") — Fase 4 pendiente
   - Requiere ventana deslizante de samples + state machine por threshold
2. ~~Volumes/Mounts en DetailPanel~~ — ✅ HECHO
3. **Recomendaciones de healthcheck** — Nueva fase, "value add" para usuarios
   - Detecta containers sin healthcheck (`service.health_status === ""`)
   - Sugiere healthcheck contextual según la imagen (postgres → pg_isready, redis → redis-cli ping, etc.)
   - Banner/widget en dashboard: "N containers sin healthcheck"
   - Tooltip en DetailPanel con ejemplo copiable
   - Opción de notificación diaria de resumen ("Tienes X containers sin healthcheck")
4. **Network I/O en stats history** — extiende `pollStats` con `networks.eth0.rx_bytes/tx_bytes`
5. **PWA + Service Worker** — para web push notifications cuando la pestaña no está abierta
6. **Image layers y tamaño** — vía `docker image inspect` + UI en DetailPanel

## Cosas que cambiaron sustancialmente desde el roadmap original

- **"Notificaciones"** evolucionó de "solo Discord" a "Discord + in-app + persistente + read/unread"
- **"Historial"** evolucionó de "CPU/RAM por servicio" a "+ totales agregados + per-service override + reset filtros"
- **Acciones** evolucionó de "stop/start/restart/rebuild" a "+ recreate + exec + remove con confirmación"
- **Seguridad** se volvió un eje propio (ALLOWED_PATHS) que no estaba en el roadmap
