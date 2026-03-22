# 07 — Seguridad (AUTH_TOKEN)

## Objetivo
Proteger el dashboard con token cuando se expone en red.

## Tareas
- [ ] Lógica de bind:
  - Sin `AUTH_TOKEN` → bind a `127.0.0.1` (solo local)
  - Con `AUTH_TOKEN` → bind a `0.0.0.0` (acceso remoto)
- [ ] Middleware Hono:
  - Valida `Authorization: Bearer <token>` en toda request excepto `/` y assets
  - 401 si token inválido
- [ ] WebSocket auth:
  - Valida token en el handshake
  - Cierra conexión si no es válido
- [ ] Pantalla de login en el frontend:
  - Input de token, botón "Entrar"
  - Guarda token en localStorage
  - Lo envía en headers y WebSocket

## Criterio de completado
Sin AUTH_TOKEN: funciona sin pedir nada en localhost.
Con AUTH_TOKEN: pide token al entrar, rechaza si es incorrecto, funciona si es correcto.
