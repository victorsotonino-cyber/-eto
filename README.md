
# Nexus Ticket & Moderation Bot

Sistema de tickets, moderación y panel web de Nexus.

## Hosting

- Bot Discord: Fadehost.
- Dashboard: Render.
- El hosting no se cambia.

## Persistencia y sincronización

Nexus usa escritura atómica de JSON, copia de respaldo .bak, recuperación automática si el archivo principal queda corrupto y flush al apagar el proceso.

La configuración del panel usa configVersion para evitar perder cambios: el bot de Fadehost conserva su copia y la vuelve a enviar al panel. Cuando se edita algo en el Dashboard, el bot lo detecta y lo aplica.

Variables:

- DISCORD_TOKEN o BOT_TOKEN o TOKEN
- DISCORD_CLIENT_SECRET solo en Render
- PANEL_SYNC_SECRET igual en Render y Fadehost
- RUN_BOT=false en Render
- PORT opcional

## Servidor configurado

Guild ID: 1554248808194642040
Application ID: 1557167878183067688

## Funciones

Tickets: panel, setup, close, reopen, delete, claim, unclaim, add, remove, rename, transcript y list.

Moderación: modlog, ban, unban, kick, timeout, untimeout, warn, warnings, clearwarns, clear, lock, unlock, slowmode y nick.

Información: userinfo y serverinfo.

Postulaciones: post-staff y post-alter.

Vouches: vouch.

## Protecciones añadidas

- Máximo real de 2 tickets abiertos por usuario.
- Registros de tickets por channelId para no sobrescribir el segundo ticket.
- Bloqueo contra creación doble simultánea.
- Limpieza de tickets huérfanos.
- Validación de IDs y preguntas.
- Chequeos de jerarquía de moderación.
- Protección CSRF del Dashboard.
- Sesiones con caducidad.
- Límites de payload.
- Sincronización bidireccional del estado entre panel y bot.
- Endpoint /health.
