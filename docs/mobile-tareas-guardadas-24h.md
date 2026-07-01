# Handoff mobile — Tareas "guardada"/"preparar" vencidas

> Actualizado julio 2026: se retiró el borrado físico. Resumen para coordinar mobile.

## Qué cambió

El cron diario que borraba físicamente las tareas `guardada` con más de 24 hs
(`limpiarTareasGuardadas`, en `src/lib/limpiar-tareas.ts`) **se eliminó**. Ninguna
fila de `tareas` se borra automáticamente ya — la data queda disponible para
siempre para el Historial (ver punto siguiente).

El filtro de display que oculta del **tablero**/kanban lo que ya no es operativo
sigue existiendo (y ahora es la única fuente de verdad de qué se ve):

- `guardada`: oculta si pasaron las 00:00 (hora Argentina) desde `updated_at`.
- `preparar` / `salida_programada`: oculta si su fecha de salida (`porteria.desde`)
  ya pasó y no avanzó a `navegando`.
- `navegando`: siempre visible, sin importar la fecha.

Todo lo que el filtro oculta del tablero sigue existiendo como fila viva y
aparece en el **Historial** (nueva vista en `(dashboard)/(admin)/tareas`, y nueva
tab en el grupo `(operario)` de mobile), incluyendo lo cancelado (`porteria.estado
= 'revocado'` para salidas, `solicitudes_lavado.estado = 'cancelada'` para
lavados).

## Resumen

- **Sin borrado físico**: todo queda en la base, mobile y web pueden confiar en
  que la fila sigue existiendo después de las 24 hs.
- **Filtro de display**: sigue siendo responsabilidad de cada cliente (web/mobile)
  ocultar del tablero lo que ya no es operativo del día — mismo criterio en
  ambos, documentado arriba.
