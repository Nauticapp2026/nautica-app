# Arquitectura — Web admin (Next.js)

Implementación específica del repo `nautica-app` (Next.js + Vercel + shadcn). Para los conceptos que aplican a todos los clients (modelo multi-tenant, roles, super admin, integraciones), ver `arquitectura-compartida.md`.

Para reglas operativas al codear ver `CLAUDE.md` en la raíz.

---

## Stack

- **Framework**: Next.js (App Router) + React Server Components + Server Actions.
- **Estilos**: Tailwind CSS v4 + componentes shadcn/ui en `src/components/ui/`.
- **DB client**: Drizzle ORM (`postgres-js` driver) sobre la Postgres de Supabase.
- **Hosting**: Vercel. Preview por PR, prod en cada merge a `main`.

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

Helpers principales en `src/lib/auth/session.ts`:

- `getCurrentUser()` — el `auth.users` actual (con cache).
- `getActiveMarina()` — contexto completo: profile + memberships + guardería activa (cookie `active_guarderia_id` o la primera).
- `requireRole(allowed)` — gate por rol; super admin bypassa.
- `requireSuperAdmin()` — exige el flag `is_super_admin`, no exige membership.
- `getPostLoginRedirect()` — decide la URL de destino según el contexto.

---

## Panel super admin

Vive en `src/app/super-admin/`, fuera del `(dashboard)`. Reusa el mismo `Sidebar` que el dashboard via prop `variant="super-admin"`.

Secciones:

- **Inicio** (`/super-admin`) — métricas globales.
- **Guarderías** (`/super-admin/guarderias`) — listado con stats + delete cascade.
- **Usuarios** (`/super-admin/usuarios`) — listado cross-tenant con eliminar / toggle super admin / cambiar rol.
- **Pricing** (`/super-admin/pricing`) — edita planes y capacidades de la landing.

Server actions: `src/app/actions/super-admin/{pricing,usuarios,guarderias}.ts`. Todas validan con Zod y empiezan con `await requireSuperAdmin()`.

Si agregás una sección, sumá el item al nav en `src/components/shared/sidebar.tsx` (dentro del módulo `'use client'`, no como prop — los icons de lucide no cruzan el boundary server→client).

---

## DB y migraciones (web)

- **Schema** en `src/lib/db/schema.ts` (Drizzle). Fuente de verdad de tipos.
- **Migraciones SQL** en `supabase/migrations/` (numeradas `0001_…`, `0002_…`, etc.). Se aplican a mano en el SQL Editor de Supabase.
- `pnpm db:generate` está roto en este entorno (issue de TTY); las migraciones se escriben a mano.
- `drizzle/meta/` está en `.gitignore` por la misma razón.

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

- Rama → PR → preview de Vercel → merge a `main` → deploy automático a prod. Nunca pushear directo a `main`.
- Husky + lint-staged corren prettier + eslint en cada commit. Si un hook falla, arreglar la causa — no usar `--no-verify`.
- Conventional commits en español.

---

## Comandos frecuentes

```bash
pnpm dev              # desarrollo
pnpm typecheck        # antes de pushear
pnpm lint
pnpm db:studio        # inspeccionar la DB
```

`pnpm db:generate` no anda — escribir migraciones a mano.
