# Arquitectura — `nautica-app` (web admin)

Overview del repo web. Para setup y comandos básicos ver `README.md`. Para reglas operativas al codear ver `CLAUDE.md` en la raíz.

Este es el repo del **dashboard web** del producto. Hay una app mobile separada (no en este repo) que cubre los roles que operan desde celular (socio, invitado, seguridad/portería, etc.). Acá no se documenta el mobile — cada repo tiene su propio doc.

Mobile y web comparten **el mismo proyecto Supabase**, así que se comunican vía tablas y triggers (ver sección "Integración mobile↔web" más abajo).

---

## Stack

- **Framework**: Next.js (App Router) + React Server Components + Server Actions.
- **DB**: Postgres en Supabase. Acceso desde el server con Drizzle ORM (`postgres-js` driver).
- **Auth**: Supabase Auth (email/password). Middleware refresca sesión en cada request.
- **Estilos**: Tailwind CSS v4 + shadcn/ui en `src/components/ui/`.
- **Validación**: Zod en los bordes (server actions, route handlers).
- **Hosting**: Vercel — preview por PR, prod en cada merge a `main`.
- **Facturación AFIP**: integración con tusfacturas.app (cliente en `src/lib/tusfacturas/`).

---

## Modelo multi-tenant

La app es **multi-tenant** — cada cliente del SaaS es una _guardería_ (también llamada "club" o "marina"). Todos los datos operativos se scopean a una `guarderia_id`.

### Tablas principales

```
guarderias                                         (la unidad de tenant)
├── memberships    (user_id, guarderia_id, rol)    (un user puede estar en varias)
├── areas → naves → lados → pisos → espacios       (jerarquía de espacios)
├── marinas (peines/docks)
├── embarcaciones
├── tarifas, servicios
├── facturacion + items_orden + pagos
├── comunicaciones, alertas
├── tareas, solicitudes_lavado
└── porteria, porteria_invitados, actividad_porteria
```

`profiles` es global (1:1 con `auth.users`). `memberships` une `profiles` con `guarderias` y guarda el rol. RLS habilitado en todas las tablas relevantes — las policies viven en `supabase/migrations/`.

### Roles

Definidos en `src/config/roles.ts`. Vive en `memberships.rol` (per-guardería, no global):

- **administrador_general** (label "Admin") — todo el dashboard web.
- **administrativo** — mismos permisos que `administrador_general`. Modelado como rol separado para distinguirlo en listados, pero todos los gates `isAdmin` los tratan igual. Si agregás un check de admin, **incluí ambos**.
- **operario** — solo `/tareas` en la web.
- **seguridad** (label "Portería / Seguridad") — opera desde mobile.
- **contable**, **mantenimiento**, **comunicaciones**, **restaurantes** — roles legacy que existen para miembros antiguos. El selector de "Agregar miembro al equipo" ya no los ofrece (acotado a Admin / Administrativo / Operario / Portería-Seguridad).
- **socio**, **invitado**, **proveedor** — usuarios finales del club, principalmente mobile.

### Enforcement

1. Las queries Drizzle filtran por `guarderia_id` en el código.
2. Las policies RLS son la red de seguridad final.
3. Las rutas `(dashboard)/(admin)/` revisan rol en su layout.
4. Server actions validan rol antes de mutar.

`getActiveMarina()` (en `src/lib/auth/session.ts`) devuelve el contexto del user logueado: profile, memberships y la guardería activa (la del cookie `active_guarderia_id`, o la primera).

---

## Super admin (cross-tenant)

Excepción al modelo multi-tenant: el `super_admin` administra la **plataforma**, no una guardería.

- **Modelo**: `profiles.is_super_admin` (boolean) + función SQL `public.is_super_admin()` (en migración 0001) usada por las policies RLS para dar bypass cross-tenant. Es **distinto** del valor `'super_admin'` del enum `rol`, que es a nivel de membership y prácticamente no se usa.
- **Helper**: `requireSuperAdmin()` en `session.ts` — carga el profile y valida el flag, sin exigir membership en ninguna guardería.
- **Routing**: `src/app/super-admin/` (fuera del `(dashboard)`). Reusa el mismo `Sidebar` con `variant="super-admin"`. Si agregás una sección, sumá el item al nav en `src/components/shared/sidebar.tsx` (dentro del módulo `'use client'`, no como prop — los icons de lucide no cruzan el boundary server→client).
- **Secciones actuales**:
  - **Inicio** — métricas globales (guarderías activas, cuentas, super admins, espacios, embarcaciones).
  - **Guarderías** — listado con stats por club, eliminación cascade.
  - **Usuarios** — listado cross-tenant: eliminar cuenta, toggle `is_super_admin`, cambiar rol por membership, quitar membership.
  - **Pricing** — edita rate por plan (Classic/Plus/Platinum) y capacidades del slider de la landing. La landing pública lee de `pricing_plans` y `platform_settings`.
- **Server actions**: en `src/app/actions/super-admin/{pricing,usuarios,guarderias}.ts`, todas validadas con Zod y empezando con `await requireSuperAdmin()`.
- **Tablas globales (no scopeadas)**: `pricing_plans`, `platform_settings`. RLS: SELECT público (la landing es anónima) + INSERT/UPDATE/DELETE solo super admin.

---

## Estructura de directorios

```
src/
├── app/
│   ├── (auth)/              # login, signup, accept-invite
│   ├── (dashboard)/         # app del cliente; layout exige membership activa
│   │   ├── (admin)/         # rutas que solo ven roles admin
│   │   └── tareas/          # operario también accede acá
│   ├── (onboarding)/        # wizard para registrar un club nuevo
│   ├── super-admin/         # panel cross-tenant
│   ├── actions/             # Server Actions, agrupadas por dominio
│   │   └── super-admin/     # actions del panel cross-tenant
│   ├── api/                 # solo para webhooks y crons (no CRUD de app)
│   │   └── cron/            # mensuales (idempotentes)
│   ├── auth/callback/       # OAuth callback
│   ├── no-access/           # cuenta sin acceso al dashboard
│   └── page.tsx             # landing pública
├── components/
│   ├── landing/             # secciones de la landing
│   ├── shared/              # Sidebar, MarinaSwitcher, UserMenu, Logo
│   └── ui/                  # shadcn (Button, Input, Card, etc.)
├── config/roles.ts          # ROLES, MEMBERSHIP_ROLES, ROL_LABELS
├── lib/
│   ├── auth/                # session, errors
│   ├── db/                  # schema Drizzle + cliente
│   ├── pricing/config.ts    # lectura compartida (landing + super admin)
│   ├── supabase/            # clients (server, client, admin)
│   └── tusfacturas/         # integración AFIP
└── middleware.ts            # refresh de sesión
```

---

## Mutations: Server Actions

Todas las mutaciones van por Server Actions (archivos `'use server'` en `src/app/actions/`). Las API routes en `src/app/api/` son **solo** para webhooks externos y Vercel Cron.

Forma típica de una server action que toca data del cliente:

```ts
'use server';
export async function updateXAction(input: UpdateXInput): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'No autorizado' };

  const parsed = updateXSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Inválido' };

  await db.update(...).where(eq(..., parsed.data.id, ctx.activeMembership.guarderiaId));
  revalidatePath('/...');
  return {};
}
```

Las del super admin reemplazan `getActiveMarina` por `requireSuperAdmin()` y no scopean por guardería.

### Uploads de archivos

- Las fotos / archivos se suben pasando un `File` por `FormData` a un Server Action, que sube a Supabase Storage con el cliente admin (service role).
- El default de Next.js para Server Actions es **1 MB**. En este repo está subido a **10 MB** en `next.config.ts` (`experimental.serverActions.bodySizeLimit`) — sin esto, las fotos típicas (2-5 MB) fallan silenciosamente.
- Si en algún momento se necesitan archivos > 10 MB, conviene migrar a upload directo a Storage desde el cliente con Signed URL.
- **Buckets actuales**: `documentos` (privado, docs adjuntos a socios), `guarderia-fotos` (público, galería del club), `comunicaciones` (público, imágenes adjuntas a comunicaciones — varias por aviso, persistidas como `text[]`). Los buckets se crean on-demand desde la primer subida (`ensureBucket`).
- Componente UI compartido `src/components/shared/images-uploader.tsx` (`ImagesUploader`) — multi-imagen con preview y botón quitar; lo usan los modales de comunicaciones (admin y super admin).

---

## Auth flow

1. User entra a `/login` → `login` action de `src/app/actions/auth.ts` autentica con Supabase.
2. `getPostLoginRedirect()` (en `src/lib/auth/session.ts`) decide:
   - Operario con membership → `/tareas`.
   - Otro rol con membership → `/dashboard`.
   - Sin membership pero `is_super_admin` → `/super-admin`.
   - Sin membership y no super admin → `/no-access`.
3. Layouts protegen: `(dashboard)/layout.tsx` exige membership; `super-admin/layout.tsx` exige `is_super_admin`.
4. `src/middleware.ts` refresca la sesión en cada request via `updateSession`.

### Reset de contraseña

- `/forgot-password` (form pidiendo email) → `requestPasswordReset` action que dispara `supabase.auth.resetPasswordForEmail` con redirect a `/auth/callback?next=/reset-password`.
- El usuario recibe un mail (template HTML en `email-templates/05-reset-password.html`) con un link.
- Click en el link → `/auth/callback` setea la sesión de recovery → redirige a `/reset-password`.
- `/reset-password` (form de nueva contraseña) → `updatePassword` action que llama a `supabase.auth.updateUser({ password })` y redirige según rol con `getPostLoginRedirect()`.
- En Supabase: las URLs de callback (preview y prod) deben estar en Auth → URL Configuration → Redirect URLs. Sin SMTP custom configurado, el envío del mail tiene rate limits muy bajos (~4/hora).

Helpers principales en `src/lib/auth/session.ts`:

- `getCurrentUser()` — el `auth.users` actual (con cache).
- `getActiveMarina()` — contexto completo: profile + memberships + guardería activa.
- `requireRole(allowed)` — gate por rol; super admin bypassa.
- `requireSuperAdmin()` — exige el flag `is_super_admin`, no exige membership.
- `getPostLoginRedirect()` — decide la URL de destino según el contexto.

### Pre-launch gate (Basic Auth)

Mientras el producto no está lanzado al público, toda la web está protegida con un muro de **HTTP Basic Auth** implementado en `src/middleware.ts`. El navegador muestra el prompt nativo no cerrable; cualquier request sin credencial válida recibe 401. Es **server-side** — no se puede bypasear desde el cliente.

- **Activación por env vars**: `PRELAUNCH_GATE_USER` y `PRELAUNCH_GATE_PASSWORD` en Vercel. Con ambas seteadas, el muro está activo. Si falta alguna, el muro queda desactivado (kill switch sin redeploy: borrás las vars y el sitio se "destraba").
- **Excluido del gate**: `/api/cron/*` (los crons de Vercel tienen su propia auth via `CRON_SECRET`), `/api/webhooks/*`, `/api/devices` (Bearer JWT propio), y `/auth/*` (páginas puente del confirm signup / callback OAuth, llegan desde el mail firmado por Supabase). Si se agrega un endpoint público nuevo que viene de afuera del browser, excluirlo igual — sino queda inaccesible.
- **Signup desde mobile**: el mail de Supabase abre `/auth/confirm` en la web, que actúa como puente al deep link `nauticaappmobile://confirm`. Está excluido del gate (ver arriba); si se vuelve a romper, verificar la exclusión en `middleware.ts` y que `NEXT_PUBLIC_APP_URL` siga con `www.` (sin redirect 307 que pierda el `#fragment` con los tokens).

---

## DB y migraciones

- **Schema** en `src/lib/db/schema.ts` (Drizzle). Fuente de verdad de tipos.
- **Migraciones SQL** en `supabase/migrations/` (numeradas `0001_…`, `0002_…`, etc.). Se aplican manualmente en el SQL Editor de Supabase contra prod, o con scripts ad-hoc tipo `scripts/apply-X.mjs` que usan `DIRECT_URL`. Hay un único proyecto Supabase (no hay dev separado).
- `pnpm db:generate` está roto en este entorno (issue de TTY); las migraciones se escriben a mano.
- `drizzle/meta/` está en `.gitignore` por la misma razón.
- RLS habilitado en cada tabla relevante; todas las policies viven en estas migraciones.
- `supabase/migrations/` también contiene **triggers y funciones PL/pgSQL** (no solo policies). Ej. `0010_lavado_auto_tarea_trigger.sql` materializa una tarea automáticamente cuando mobile crea una solicitud de lavado.
- **Nombres de columna**: evitar palabras reservadas de Postgres (`offset`, `order`, `user`, etc). Drizzle no las quotea consistentemente y los UPDATE pueden fallar silenciosamente. Convención: usar `orden` para columnas de ordenamiento (ver `marinas.orden`, `pisos.orden`, `naves.orden`, `espacios.orden`).

### Auditoría de cambios desde Drizzle (patrón GUC)

El cliente Drizzle (`src/lib/db/index.ts`) se conecta al pooler de Supabase con la connection string del rol postgres directamente — **no pasa por Supabase Auth**. Eso significa que cualquier trigger/función que use `auth.uid()` recibe `null` cuando el UPDATE viene de una server action. Para auditar quién hizo un cambio, hay que pasar el `user_id` por GUC dentro de una transacción.

Patrón aplicado por primera vez en el historial de tarifario (mig `0015_servicios_historial.sql`, ver `src/app/actions/tarifario.ts`):

1. En el trigger Postgres, leer el GUC seteado por la app:
   ```sql
   v_user := nullif(current_setting('app.usuario_id', true), '')::uuid;
   ```
2. En la server action, envolver el UPDATE en `db.transaction` y setear el GUC con `is_local = true` (el tercer parámetro de `set_config`) — eso lo hace local a la transacción y evita que se filtre al pool:
   ```ts
   await db.transaction(async (tx) => {
     await tx.execute(sql`SELECT set_config('app.usuario_id', ${ctx.profile.id}, true)`);
     await tx.execute(sql`SELECT set_config('app.origen_cambio', ${origen}, true)`);
     await tx.update(servicios).set(...).where(...);
   });
   ```
3. El trigger usa el GUC para clasificar el cambio (`origen` = `manual` / `masivo_porcentaje` / `masivo_monto`) y atribuirlo a un usuario.

Reusar este patrón si hay que auditar cambios en otra tabla.

---

## Integración mobile↔web

Las dos apps comparten un solo proyecto Supabase, así que la comunicación es **vía tablas y triggers**, no APIs.

Tablas/flujos relevantes:

- **`solicitudes_lavado`** — el socio crea una solicitud desde mobile; un trigger Postgres (`AFTER INSERT WHEN tarea_id IS NULL`) materializa automáticamente una `tarea` con estado='lavado' y popula el `tarea_id` de la solicitud. El web la muestra en la tab Lavado de `/tareas`. Cuando el operario cambia el estado de la solicitud (Pendiente / En proceso / Lista / Cancelada) desde el web, la app mobile lo ve en la solicitud del socio. Ver `updateSolicitudLavadoEstadoAction` en `actions/tareas.ts`.
- **`porteria_invitados`** — el admin invita personas desde el web; el portero las ve en mobile al escanear QR.
- **`actividad_porteria`** — registros de ingresos/egresos creados por el portero en mobile; se ven en el web.
- **`tareas`** con `porteria_id` no nulo — pueden venir de mobile.

Antes de cambiar una tabla compartida (renombrar columna, cambiar enum, dropear tabla), pensar si rompe algo del lado mobile.

---

## Design system

Tokens en `src/app/globals.css`:

- `--primary: #175861` — brand teal. Lo usa `bg-primary` (Button default, Switch checked, etc.). **No hardcodear** `#175861` cuando podés usar `bg-primary`.
- `--input` y `--ring` — gris neutro. **No overridear** focus/border de inputs con colores custom.
- Clases custom para headers de página: `.page-title` (30px) y `.page-subtitle` (16px).

Componentes shadcn/ui en `src/components/ui/`:

- Para botones destructivos: `Button variant="outline"` + `className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"`.
- Para `<select>` nativos en filas de tabla, copiar las clases tokens del Input shadcn (`border-input focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]`) — no inventar focus colors.

---

## Deploy

- Rama → PR → preview de Vercel → merge a `main` → deploy automático a prod. **Nunca pushear directo a `main`**.
- Husky + lint-staged corren prettier + eslint en cada commit. Si un hook falla, arreglar la causa — no usar `--no-verify`.
- Conventional commits en español: `feat(area): ...`, `fix(area): ...`.

---

## Espacios — reorden y búsqueda

Cada `area` puede ser una `marina` (con `peines` y `amarras`) o una `nave` (con `lados → pisos → espacios`). Los espacios individuales (`espacios.id`) viven dentro de un peine (marina) o un piso (nave).

- **Orden manual**: la columna `espacios.orden` (integer, default 0) guarda el orden en que el admin acomoda los espacios dentro de un peine/piso. La query del page tsx (`(admin)/espacios/page.tsx`) ordena por `orden ASC, created_at ASC` — el segundo es fallback cuando todos los `orden` empatan en 0 (espacios recién creados). **No agregar sorts adicionales** post-query — pisan el orden manual.
- **Drag-and-drop**: implementado con `@dnd-kit/sortable` (`SortableContext` + `useSortable` por espacio) y `closestCenter` collision detection en el `DndContext`. Tres casos en `onDragEnd`: drop sobre espacio del mismo container → reorder (setea `orden = idx`); drop sobre espacio de otro container → mover; drop sobre container vacío → mover. Persistencia vía `reorderEspaciosAction` (usa Supabase admin client — Drizzle daba problemas raros con esa tabla).
- **Buscador**: panel arriba del listado de áreas con filtros (eslora del barco, manga, tipo, nomenclatura, solo disponibles). Resultados en vivo con botón "Editar / Asignar" que abre el modal del espacio.

---

## Facturación / Movimientos mensuales

La cuota mensual de un socio se genera **por espacio asignado con servicio**, no por ser socio. Cada espacio tiene su propio día de cobro = el día en que se asignó al socio (modelo "aniversario", introducido por la migración 0017).

- **Disparador 1 — alta**: al asignar ocupante + servicio en `updateEspacioAction` (`src/app/actions/espacios.ts`) → crea el movimiento del mes corriente, con prorrateo si cae a mitad de mes (`(precio / días_del_mes) * días_restantes`, incluye el día de asignación). El `concepto` lleva sufijo `"(proporcional X/Y días)"` cuando aplica. La server action también setea `espacios.fecha_asignacion = NOW()` (el "aniversario" del espacio).
- **Disparador 2 — cron diario**: `/api/cron/mensuales` corre **todos los días** (`vercel.json` cron `0 5 * * *` ≈ 2 AM ARG). Recorre todos los espacios con ocupante + servicio y, para cada uno, decide si hoy es su día de cobro:
  - Espacios con `fecha_asignacion = NULL` (modelo viejo, asignados antes del deploy de la mig 0017): cobra solo el día 1 del mes.
  - Espacios con `fecha_asignacion` seteada: cobra cuando hoy es el aniversario. Edge case: si el día original no existe en el mes corriente (ej. asignación día 31, mes con 28 días), cobra el último día del mes — `Math.min(diaOriginal, diasDelMesActual)`.
- **Helper común**: `ensureMonthlyMovimiento` en `src/lib/movimientos-mensuales.ts`. Idempotencia por `(socio_id, espacio_id, tipo='mensual', fecha en últimos 27 días)` — la ventana cubre tanto el modelo viejo (cobros cada ~30 días) como el aniversario (28-31 días) sin permitir duplicados, y absorbe re-runs del cron en el mismo día. Un socio con N espacios genera N movimientos por ciclo, incluso si comparten servicio.
- **Cambio de ocupante**: cuando `ocupanteId` pasa de un socio a otro (o de null a not null), `fecha_asignacion` se actualiza a `NOW()` → ciclo nuevo, prorrateo nuevo. Si `ocupanteId` pasa a null, `fecha_asignacion` también vuelve a null.
- **Precio del cobro**: se usa la tarifa **vigente** en el momento del cron, no la del ciclo anterior. Cambios de tarifa impactan al siguiente cobro mensual.
- **Tabla**: `movimientos_cuenta_corriente` con columnas `socio_id`, `espacio_id` (FK a `espacios.id`, ON DELETE SET NULL — agregada en migración 0013), `servicio_id`, `concepto`, `tipo`, `debe`, `haber`, `fecha`, `proximo_pago`.
- **No se cobra al alta del socio**. `createSocioAction` no genera ningún movimiento.

---

## Integraciones externas

- **Supabase** — Auth, Postgres, RLS. Único proyecto (prod).
- **tusfacturas.app** — emisión de facturas AFIP. Credenciales `TUSFACTURAS_*` en env vars.
- **Vercel Cron** — `src/app/api/cron/mensuales` corre los movimientos mensuales (ver sección anterior). Es idempotente.

---

## Comandos frecuentes

```bash
pnpm dev              # desarrollo
pnpm typecheck        # antes de pushear
pnpm lint
pnpm db:studio        # inspeccionar la DB
```

`pnpm db:generate` no anda — escribir migraciones a mano.
