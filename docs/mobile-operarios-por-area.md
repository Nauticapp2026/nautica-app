# Handoff mobile — Ruteo de tareas a operarios por área

> Cambio hecho en el repo **web** (migración `0103`, junio 2026). El modelo de datos
> ya está en la DB compartida. Falta el lado **mobile**: filtrar la lista de tareas
> del operario por sus áreas. Este doc tiene todo lo necesario para hacerlo.

## Qué cambió y por qué

Antes una tarea se asignaba (o se autoasignaba) a **un** operario. Ahora cada tarea
se asocia a un **área** y la ven **todos los operarios de esa área**; el que está
disponible la "toma" (se autoasigna, flujo existente). El admin sigue viendo todo.

- El operario pertenece a una o más **áreas** (`areas` = el agrupador top que junta
  naves/marinas).
- El área de una tarea se deriva de: **embarcación → espacio (`espacios.area_id`)**.
- Aplica a **todas** las tareas (lavado, salida, manuales), no solo lavado.

## Modelo de datos (ya en la DB)

### Tabla nueva: `area_operarios` (M:N operario ↔ área)

| Columna        | Tipo        | Notas                       |
| -------------- | ----------- | --------------------------- |
| `id`           | uuid PK     |                             |
| `guarderia_id` | uuid        | FK `guarderias`             |
| `area_id`      | uuid        | FK `areas`                  |
| `operario_id`  | uuid        | FK `profiles` (el operario) |
| `created_at`   | timestamptz |                             |

Único `(area_id, operario_id)`. RLS: los **miembros** de la guardería pueden
`SELECT` las filas de su guardería (o sea el operario puede leer sus áreas).

### Columna nueva: `tareas.area_id`

- `uuid` nullable, FK `areas` (`ON DELETE SET NULL`).
- La **estampan automáticamente los triggers** al crear la tarea (lavado y salida),
  derivándola de la embarcación → espacio. **Mobile no tiene que setearla** en esos
  flujos.
- `NULL` = tarea **sin área** → la ven **todos** los operarios de la guardería.

## Lógica de filtrado que tiene que aplicar mobile

En la lista de tareas del **operario**, mostrar una tarea si:

```
tarea.guarderia_id = <guardería del operario>
AND (
  tarea.area_id IS NULL                          -- sin área: la ven todos
  OR tarea.area_id IN (                          -- o es de un área del operario
    SELECT area_id FROM area_operarios
    WHERE operario_id = <id del operario>
      AND guarderia_id = <guardería del operario>
  )
)
```

El **admin** no filtra (ve todas). Esto es exactamente lo que hace el web en
`src/app/(dashboard)/tareas/page.tsx`.

### Ejemplo con supabase-js

```ts
// 1. Áreas del operario
const { data: areasOp } = await supabase
  .from('area_operarios')
  .select('area_id')
  .eq('operario_id', userId)
  .eq('guarderia_id', guarderiaId);

const areaIds = (areasOp ?? []).map((r) => r.area_id);

// 2. Tareas: del área del operario o sin área
let q = supabase.from('tareas').select('*').eq('guarderia_id', guarderiaId);
q = areaIds.length
  ? q.or(`area_id.is.null,area_id.in.(${areaIds.join(',')})`)
  : q.is('area_id', null);
const { data: tareas } = await q;
```

## Casos borde

- **Operario sin áreas asignadas** → ve **solo** las tareas sin área (`area_id` null).
  El admin debe asignarlo a sus áreas desde la web (/espacios).
- **Tarea sin embarcación/espacio, o espacio sin área** → `area_id` null → la ven
  todos.
- Si mobile **inserta tareas directamente** (algún flujo propio), debería setear
  `area_id` desde la embarcación → `espacios.area_id`, o dejarlo null (lo verán
  todos). Para lavado y salida no hace falta: lo hacen los triggers.

## Estado actual

- **Sin el cambio en mobile no se rompe nada**: mobile sigue mostrando todas las
  tareas como hasta ahora. El filtro es una mejora aditiva.
- Web ya filtra para operarios y permite asignar operarios a áreas en /espacios.
