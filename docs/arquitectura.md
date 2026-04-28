# Arquitectura — Náutica App

Overview del sistema. Para setup y comandos ver `README.md`. Para reglas operativas al codear ver `CLAUDE.md`.

---

## Stack

- **Frontend / fullstack**: Next.js (App Router) + React Server Components + Server Actions.
- **DB**: Postgres en Supabase. Acceso desde el server con Drizzle ORM (`postgres-js` driver). RLS habilitado en todas las tablas relevantes.
- **Auth**: Supabase Auth (email/password). Middleware de Next refresca la sesión en cada request.
- **Estilos**: Tailwind CSS v4 + componentes shadcn/ui en `src/components/ui/`.
- **Validación**: Zod en los bordes (server actions, route handlers).
- **Hosting**: Vercel. Preview por PR, prod en cada merge a `main`.
- **Facturación AFIP**: integración con tusfacturas.app (cliente en `src/lib/tusfacturas/`).

---

## Modelo multi-tenant

La app es **multi-tenant** — cada cliente es una _guardería_ (también llamada "club" o "marina"). Todos los datos operativos están scopeados a una `guarderia_id`.

### Tablas principales

```
guarderias                                         (la unidad de tenant)
├── memberships    (user_id, guarderia_id, rol)    (un user puede pertenecer a varias)
├── areas → naves → lados → pisos → espacios       (jerarquía de espacios)
├── marinas (peines/docks)
├── embarcaciones
├── tarifas, servicios
├── facturacion + items_orden + pagos
├── comunicaciones, alertas
├── tareas, solicitudes_lavado
└── porteria, porteria_invitados, actividad_porteria
```

### Roles

Definidos en `src/config/roles.ts`. El rol vive en `memberships.rol` (es per-guardería, no global):

- **administrador_general** — acceso total al dashboard web.
- **operario** — solo a `/tareas`.
- **contable**, **mantenimiento**, **comunicaciones**, **restaurantes**, **seguridad** — staff específico, mayoría opera desde la app mobile.
- **socio**, **invitado**, **proveedor** — usuarios finales del club, app mobile.

### Enforcement

1. Las queries Drizzle filtran por `guarderia_id` en el código.
2. Las policies RLS de Supabase son la red de seguridad.
3. Las rutas `(dashboard)/(admin)/` revisan el rol en su layout.
4. Server actions validan rol antes de mutar.

`getActiveMarina()` (en `src/lib/auth/session.ts`) devuelve el contexto del user logueado: profile, memberships y la guardería activa (la del cookie `active_guarderia_id`, o la primera).

---

## Super admin (cross-tenant)

Excepción al modelo multi-tenant: el `super_admin` administra la **plataforma**, no una guardería.

- **Modelo**: `profiles.is_super_admin` (boolean) + función SQL `public.is_super_admin()` (en migración 0001) para bypass en RLS. Es **distinto** del valor `'super_admin'` del enum `rol`, que es a nivel de membership y prácticamente no se usa.
- **Helper**: `requireSuperAdmin()` en `session.ts` — carga el profile y valida el flag, sin exigir membership en ninguna guardería.
- **Routing**: `src/app/super-admin/` (fuera del `(dashboard)`). Reusa el mismo `Sidebar` con `variant="super-admin"`.
- **Secciones**:
  - **Inicio** — métricas globales (guarderías activas, cuentas, super admins, espacios, embarcaciones).
  - **Guarderías** — listado con stats, eliminación cascade.
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
│   ├── super-admin/         # panel cross-tenant (ver sección anterior)
│   ├── actions/             # Server Actions, agrupados por dominio
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

Todas las mutaciones van por Server Actions (archivos `'use server'` en `src/app/actions/`). Forma típica:

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

Las del super admin reemplazan `getActiveMarina` por `requireSuperAdmin()`.

Las API routes en `src/app/api/` son **solo** para:

- Webhooks externos (ej. tusfacturas, supabase auth).
- Vercel Cron (`api/cron/mensuales` — idempotente).

---

## Auth flow

1. User entra a `/login` → `login` action de `src/app/actions/auth.ts` autentica con Supabase.
2. `getPostLoginRedirect()` decide:
   - Operario con membership → `/tareas`.
   - Otro rol con membership → `/dashboard`.
   - Sin membership pero `is_super_admin` → `/super-admin`.
   - Sin membership y no super admin → `/no-access`.
3. Layouts protegen: `(dashboard)/layout.tsx` exige membership; `super-admin/layout.tsx` exige `is_super_admin`.
4. Middleware (`src/middleware.ts`) refresca la sesión en cada request via `updateSession`.

---

## DB y migraciones

- **Schema** en `src/lib/db/schema.ts` (Drizzle). Es la fuente de verdad de tipos.
- **Migraciones SQL** en `supabase/migrations/` (numeradas `0001_…`, `0002_…`, etc.). Se aplican manualmente en el SQL Editor de Supabase contra dev y prod cuando hace falta.
- `pnpm db:generate` está roto en este entorno (issue de TTY); las migraciones se escriben a mano.
- RLS está habilitado en cada tabla relevante; todas las policies viven en estas migraciones SQL.

---

## Design system

Tokens en `src/app/globals.css`:

- `--primary: #175861` — brand teal. Lo usa `bg-primary` (Button default, Switch checked, etc.).
- `--input` y `--ring` — gris neutro, **no se overridean** en inputs específicos.
- Clases custom: `.page-title` (30px) y `.page-subtitle` (16px) para headers de página.

Componentes shadcn/ui en `src/components/ui/`. Para variantes destructivas: `Button variant="outline"` + clases `border-red-200 text-red-600 …`.

---

## Deploy

- Rama → PR → preview de Vercel → merge a `main` → deploy automático a prod.
- Nunca pushear directo a `main`.
- Husky + lint-staged corren prettier + eslint en cada commit.
- Conventional commits en español: `feat(area): ...`, `fix(area): ...`, etc.

---

## Integraciones externas

- **Supabase** — Auth, Postgres, RLS. Único proyecto (prod).
- **tusfacturas.app** — emisión de facturas AFIP. Credenciales `TUSFACTURAS_*` en env vars.
- **Vercel Cron** — `src/app/api/cron/mensuales` corre los movimientos mensuales. Idempotente.
