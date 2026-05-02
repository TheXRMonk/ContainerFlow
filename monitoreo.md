# Flowteon — Roadmap de Monitoreo

## Fase 1: Acciones básicas
- [ ] Stop / Start / Restart desde el DetailPanel
- [ ] Confirmación antes de ejecutar acciones destructivas (stop/restart)
- [ ] Feedback visual del estado de la acción (loading, success, error)
- [ ] Rebuild (docker compose up --build) por servicio

## Fase 2: Notificaciones
- [ ] Webhooks configurables (Discord, Slack)
- [ ] PWA — Service Worker + manifest
- [ ] Push notifications cuando un contenedor cae o health check falla
- [ ] Panel de configuración de notificaciones en la UI

## Fase 3: Historial y métricas
- [ ] SQLite para persistir stats (CPU, RAM, network I/O)
- [ ] Gráficas temporales de CPU/RAM por servicio (últimas 1h, 6h, 24h, 7d)
- [ ] Dashboard de métricas agregadas
- [ ] Retención configurable (auto-limpiar datos viejos)

## Fase 4: Alertas
- [ ] Reglas de alertas (ej: CPU > 80% por 5 min)
- [ ] Historial de alertas disparadas
- [ ] Integración con notificaciones (Fase 2)
- [ ] Alertas por health check fallido

## Fase 5: Info avanzada
- [ ] Volumes/Mounts por contenedor
- [ ] Terminal interactiva (docker exec) desde la UI
- [ ] Network inspector (tráfico entre servicios)
- [ ] Image layers y tamaño

## Fase 6: Deployment (futuro)
- [ ] GitHub integration (webhook + clone + build)
- [ ] Build pipeline (docker build desde Dockerfile)
- [ ] Deploy management (docker-compose dinámico)
- [ ] Domain routing automático (Traefik/Caddy)
- [ ] Rollbacks (mantener imágenes anteriores)
- [ ] Env var editing + rebuild desde la UI
