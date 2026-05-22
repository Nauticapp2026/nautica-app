# CLAUDE.md

Instrucciones para Claude Code al trabajar en este repo. La descripción general del proyecto, setup y stack están en `README.md`.

---

## Reglas críticas

### 1. Multi-tenancy: todo se scopea por `guarderia_id`

Esta es la regla más importante. **Cada consulta, server action o route handler que toca datos de la app debe filtrar por la guardería del usuario actual.** Saltarla genera un bug grave: un usuario viendo o modificando datos de otra guardería.

- Para joins indirectos (ej. `pisos` → `lados` → `guarderia_id`), filtrar vía la tabla intermedia. Nunca asumir que un id "pertenece" al usuario sin verificar el scope.
- RLS en Supabase es la última línea de defensa, no la primera. Filtrar también en el código.
- Antes de escribir una query nueva, preguntarse: "¿qué pasa si un admin de la guardería A llama esto con un id de la guardería B?"

**Excepción**: el panel `/super-admin/` es cross-tenant a propósito. Ver regla 6.

### 2. Roles: admin vs operario

- **Admin** (`administrador_general` o `administrativo`): acceso total dentro de su guardería (dashboard, configuración, usuarios, espacios, tarifario, facturación, comunicaciones, tareas).
- **Operario**: tareas asignadas y operativa básica.
- **Seguridad**: portería/acceso. Opera desde la app mobile únicamente — no tiene pantallas propias en este repo web.

**Importante**: los roles `administrador_general` y `administrativo` tienen exactamente los mismos permisos. Todo gate que chequea `isAdmin` debe aceptar ambos. Ver `src/config/roles.ts` para la lista completa y los grupos (`ADMIN_ROLES`, `STAFF_ROLES`).

Enforcement:

- `middleware.ts` redirige según rol.
- Server actions verifican rol antes de mutar.
- Las rutas `(dashboard)/(admin)/` están protegidas por layout.

Nunca confiar solo en ocultar UI — validar siempre del lado del server.

### 3. Mutations vía Server Actions

Todas las mutaciones van por Server Actions en `src/app/actions/`. No crear route handlers para mutar (los `api/` que existen son para webhooks o crons, no para CRUD de la app).

### 4. Validación con Zod en los bordes

Cualquier input que venga del cliente (form, query string, body) se valida con Zod en el server action o route handler antes de tocar la DB.

### 5. Zona horaria Argentina

Todo lo que se muestre al usuario con hora/fecha tiene que estar en TZ `America/Argentina/Buenos_Aires`. Postgres guarda en UTC; convertir al formatear. (Ya pasó: alertas del dashboard mostraban UTC en lugar de hora local — fix `f202efb`.)

### 5.1. Archivos `'use server'` solo exportan async functions

Los archivos en `src/app/actions/` empiezan con `'use server'`. Next.js 16 con Turbopack solo permite **exportar async functions** desde esos archivos. Si exportás una const, un type, un objeto o cualquier valor no-async, el typecheck pasa pero **runtime crashea** con:

> A "use server" file can only export async functions, found object.

Y el cliente ve solo "This page couldn't load. A server error occurred."

Si necesitás compartir constantes / types / enums entre el cliente y un server action, ponelos en un archivo separado sin `'use server'` (ej. `src/app/(dashboard)/tareas/constants.ts`) y que ambos los importen de ahí.

### 6. Super admin (cross-tenant)

`super_admin` es un nivel de **plataforma**, no de guardería. Modelado con `profiles.is_super_admin` (boolean) + función SQL `public.is_super_admin()` para bypass en RLS. El valor `'super_admin'` en el enum `rol` es algo distinto (rol dentro de una guardería) y prácticamente no se usa.

- Para gating en server: usar `requireSuperAdmin()` de `src/lib/auth/session.ts`. No exige `getActiveMarina` (un super admin no necesita estar en ninguna guardería).
- Server actions del panel viven en `src/app/actions/super-admin/`, todas empiezan con `await requireSuperAdmin()` y validan con Zod.
- Tablas globales (no scopeadas) — `pricing_plans`, `platform_settings`. Si agregás otra, sus policies son: SELECT público (si la lee la landing) o solo super admin, INSERT/UPDATE/DELETE solo `is_super_admin()`.
- Routing: el panel está en `/super-admin/` (fuera del `(dashboard)`). Reusa el `Sidebar` con `variant="super-admin"`. Si querés agregar una sección, agregá item al nav en `src/components/shared/sidebar.tsx` (dentro del módulo, no como prop — los icons de lucide no cruzan el boundary server→client).

### 7. Design system — respetar tokens shadcn

- `--primary` en `src/app/globals.css` está apuntado al brand teal `#175861`. Botones default y bg-primary toman ese color, **no inventar otro hex** ni hardcodear `#175861` cuando podés usar `bg-primary`.
- **No overridear `focus-visible:border-*` ni `focus-visible:ring-*`** de inputs. El ring neutro default es la decisión de diseño. Si necesitás un `<select>` nativo en un lugar donde el shadcn `Select` es overkill (ej. dentro de filas de tabla), copiá las mismas clases de tokens del Input (`border-input focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]`).
- Para botones destructivos: `Button variant="outline"` + `className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"`.
- Headers de página: `<h1 className="page-title">` y `<p className="page-subtitle">`. Las clases están en globals.css.

---

## Convenciones de código

- **Schema de DB**: `src/lib/db/schema.ts` es la fuente de verdad de tipos. `pnpm db:generate` está roto — las migraciones SQL se escriben a mano en `supabase/migrations/` y se aplican desde el SQL Editor de Supabase o con un script `scripts/apply-X.mjs`. La carpeta `supabase/migrations/` también guarda triggers y funciones PL/pgSQL, no solo policies.
- **Supabase clients**: usar el correcto según contexto.
  - `src/lib/supabase/server.ts` — server components y server actions.
  - `src/lib/supabase/client.ts` — client components.
  - `src/lib/supabase/admin.ts` — solo para casos que requieran service role (cuidado).
- **Auth helpers**: `src/lib/auth/session.ts` para obtener usuario + rol + guardería actual.
- **Errores**: usar los tipados de `src/lib/auth/errors.ts` cuando aplique.
- **Tipos**: schema de DB es la fuente de verdad. Inferir tipos desde Drizzle (`InferSelectModel`, `InferInsertModel`).
- **UI**: componentes shadcn/ui en `src/components/ui/`, propios reusables en `src/components/shared/`.
- **Toasts**: usar `sonner` (`toast.success` / `toast.error`) después de cada server action. Mantener el inline para accesibilidad.
- **Uploads de archivos**: van por Server Action con `FormData`. El bodySizeLimit está seteado a 10 MB en `next.config.ts`. Si el archivo puede pasar de 10 MB, migrar a upload directo a Storage con Signed URL.
- **Palabras reservadas en nombres de columna**: evitarlas. Postgres reserva `offset`, `order`, `user`, etc. — aunque Drizzle teóricamente las quotea, en la práctica el comportamiento es errático (caso real: `espacios.offset` se renombró a `espacios.orden` en mig `0025` porque el UPDATE silenciosamente no aplicaba). Convención del repo: usar `orden` para columnas de ordenamiento (ver `marinas.orden`, `pisos.orden`, `naves.orden`, `espacios.orden`).
- **Debug de persistencia**: si un UPDATE devuelve éxito pero la UI no refleja el cambio (incluso después de refresh), **revisar primero todos los `.sort()` / `map` / `filter` en el page.tsx** antes de teorizar sobre Drizzle/RLS/cache. El caso típico es un sort post-query que pisa el orden de la query.
- **Auditoría desde Drizzle**: Drizzle usa el pooler de Supabase, que no propaga la sesión de auth. `auth.uid()` devuelve NULL en triggers si se llama desde Drizzle. Para pasar el user_id a triggers de auditoría, usar `set_config('app.current_user_id', id, true)` dentro de la misma transacción.

---

## Flujo de trabajo

### Deploy

Siempre: **rama → PR → preview → merge a `main`**. Nunca pushear directo a `main` ni deployar a prod manualmente. Vercel deploya prod en cada merge a `main` y genera preview en cada PR.

Naming de ramas: `feat/...`, `fix/...`, `chore/...`, `docs/...`, `refactor/...`.

### Commits

Estilo conventional commits en español: `feat(area): descripcion`, `fix(area): descripcion`, etc. Ver `git log` para ejemplos.

Husky + lint-staged corren prettier y eslint en cada commit. Si un hook falla, arreglar la causa — nunca usar `--no-verify`.

### Antes de mergear un PR

1. Esperar la preview de Vercel.
2. Verificar el cambio en la preview (no solo el diff).
3. Si toca features sensibles (auth, roles, multi-tenancy, facturación), probar el caso feliz **y** el caso de borde.

---

## Integraciones externas

- **Supabase** — Auth, Postgres, RLS. Único proyecto (prod).
- **Resend** — Emails transaccionales (aprobación de socios, invitaciones, etc.). Cliente en `src/lib/email/resend.ts`. Los mails de Supabase Auth (confirmación, reset) son un canal aparte, configurado directo en el dashboard de Supabase.
- **App mobile** — repo separado pero **comparte la misma DB Supabase**. La comunicación entre web y mobile es vía tablas compartidas y triggers Postgres. Antes de cambiar una tabla compartida (`solicitudes_lavado`, `porteria_invitados`, `actividad_porteria`, `tareas`, `notificaciones`, etc.), pensar si rompe algo del lado mobile.
- **Expo Push** — notificaciones push a iOS/Android. Tokens en tabla `device_tokens`. Envío en `src/lib/push-notifications.ts`. Cron diario en `api/cron/notificaciones-push`.
- **tusfacturas.app** — emisión de facturas AFIP. Cliente y mappers en `src/lib/tusfacturas/`. Las credenciales `TUSFACTURAS_*` son las master de NauticaApp (solo para el alta del POS); cada guardería factura con sus propias credenciales que TusFacturas devuelve al alta.
- **Vercel Cron** — tres jobs: `api/cron/mensuales` (movimientos mensuales), `api/cron/notificaciones-push` (push diario), `api/cron/historial-plan-mensual`. Si tocás ese código, considerar idempotencia (pueden correrse dos veces).
- **Pre-launch gate** — toda la web está detrás de Basic Auth hasta el lanzamiento. Se destraba borrando las env vars `PRELAUNCH_GATE_USER` y `PRELAUNCH_GATE_PASSWORD` en Vercel. Las rutas `/auth/*` y `/api/mareas` están excluidas del gate.

---

## Antes de proponer cambios

- **Leer el código existente primero.** Hay patrones establecidos (server actions, scoping, validación) — seguirlos en lugar de inventar nuevos.
- **No agregar abstracciones especulativas.** Si hay tres usos similares, repetir está bien; abstraer recién cuando hay un patrón claro.
- **No agregar dependencias sin justificación.** El stack ya cubre la mayoría de los casos.
- **Cambios destructivos** (drop de columnas, borrar features, romper APIs públicas) → confirmar con el usuario antes.

---

## Comandos frecuentes

```bash
pnpm dev              # desarrollo
pnpm typecheck        # antes de pushear, idealmente
pnpm lint
pnpm db:generate      # tras cambios en schema.ts (actualmente roto en Windows — las migraciones van a mano)
pnpm db:studio        # inspeccionar la DB
```
