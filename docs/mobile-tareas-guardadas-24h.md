# Handoff mobile — Tareas "guardada" se borran a las 24 hs

> Cambio hecho en el repo **web** (junio 2026). Resumen para coordinar mobile.

## Qué cambió

Las tareas en estado **`guardada`** (estado terminal del flujo operativo) se
**borran automáticamente a las 24 hs** de su última actualización (`updated_at`).

- **El borrado lo hace un cron diario en el backend** (a nivel DB). Cuando borra la
  fila, la tarea deja de existir para **todos** (web y mobile). **Mobile no tiene
  que borrar nada.**

## Qué necesita hacer mobile (opcional pero recomendado)

Como el cron corre **una vez por día**, una tarea `guardada` puede seguir en la base
unas horas después de cumplir las 24 hs (hasta que el cron pase). La **web** la
**oculta al instante** apenas pasan las 24 hs, con un filtro de display.

Para que mobile se comporte igual (que la guardada desaparezca a las 24 hs exactas y
no quede colgada hasta que el cron la borre), aplicar este filtro en la lista de
tareas:

```
// Ocultar las 'guardada' con más de 24 hs desde updated_at.
const VEINTICUATRO_H = 24 * 60 * 60 * 1000;
const visible = !(
  tarea.estado === 'guardada' &&
  Date.now() - new Date(tarea.updated_at).getTime() >= VEINTICUATRO_H
);
```

(Es exactamente lo que hace la web en `tareas-client.tsx`.)

## Resumen

- **Borrado a las 24 hs**: ya cubierto por el backend, sirve para web y mobile.
- **Ocultar a las 24 hs exactas (antes de que el cron borre)**: falta en mobile;
  aplicar el filtro de arriba. Sin esto no se rompe nada, solo que mobile puede
  mostrar una guardada unas horas de más.
