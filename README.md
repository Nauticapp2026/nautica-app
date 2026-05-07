# Náutica App

SaaS multi-tenant para guarderías náuticas: gestión de espacios y embarcaciones, socios, tareas operativas, tarifario, facturación electrónica (AFIP vía tusfacturas.app), comunicaciones y QR para invitados.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Supabase (Auth + Postgres + RLS) · Drizzle ORM · Tailwind 4 · shadcn/ui · Vercel

---

## Features

- **Multi-tenant** — cada usuario opera dentro de una guardería. Toda la data está scopeada por `guarderia_id` con RLS en Supabase.
- **Onboarding guiado** — alta de la guardería, configuración de espacios/lados/pisos y carga inicial de equipo.
- **Dashboard** — alertas operativas (movimientos, vencimientos, etc.) con horas en zona Argentina.
- **Espacios y embarcaciones** — espacios organizados por lado/piso, asignación a embarcaciones de socios.
- **Socios y usuarios** — alta de socios, invitaciones por email, roles admin/operario.
- **Tareas** — admin crea, asigna y supervisa; operario ve y resuelve las propias. Vinculadas a salidas/entradas.
- **Tarifario y facturación** — definición de tarifas, generación de movimientos mensuales (cron) y emisión de facturas A/B/C contra AFIP vía tusfacturas.app.
- **Comunicaciones** — envío masivo a socios.
- **QR público** — vistas de embarcación e invitado para escaneo en la guardería, sin login.
- **Responsive** — sidebar con drawer en mobile; pantallas pensadas para uso desde celular en muelle.

---

## Roles

- **Admin** — acceso total dentro de su guardería: dashboard, configuración, usuarios, espacios, tarifario, facturación, comunicaciones, tareas.
- **Operario** — acceso a tareas asignadas y operativa básica de salidas/entradas.

Definidos en `src/config/roles.ts` y enforced en server actions + RLS.

---

## Estructura

```
src/
├── app/
│   ├── (auth)/                 # login, signup, crear-cuenta, accept-invite
│   ├── (onboarding)/           # flujo de alta de guardería
│   ├── (dashboard)/
│   │   ├── (admin)/            # dashboard, espacios, usuarios, tarifario,
│   │   │                       # facturación, comunicaciones, configuración
│   │   └── tareas/             # accesible por admin y operario
│   ├── qr/                     # vistas QR públicas (embarcación / invitado)
│   ├── api/cron/               # jobs (ej. movimientos mensuales)
│   ├── auth/callback/          # callback de Supabase Auth
│   └── actions/                # server actions (auth, espacios, tareas,
│                               # facturación, onboarding, etc.)
├── components/
│   ├── ui/                     # shadcn/ui
│   └── shared/                 # sidebar, marina-switcher, user-menu, logo
├── lib/
│   ├── supabase/               # clients server / browser / admin
│   ├── db/                     # drizzle schema y conexión
│   ├── auth/                   # session helpers y errores tipados
│   ├── tusfacturas/            # client + mappers para AFIP
│   └── movimientos-mensuales.ts
├── config/                     # roles y constantes
└── middleware.ts               # auth + redirección por rol
```

---

## Setup local

### Prerrequisitos

- Node.js 20+
- pnpm 9+
- Acceso al proyecto de Supabase de dev y a las credenciales de tusfacturas.app

### Pasos

```bash
git clone git@github.com:<owner>/nautica-app.git
cd nautica-app
pnpm install

cp .env.example .env.local
# completar .env.local con valores de dev (ver sección Variables de entorno)

pnpm dev
```

App en `http://localhost:3000`.

### Variables de entorno

Ver `.env.example` para la lista completa. Bloques principales:

- **Supabase** — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- **Drizzle** — `DATABASE_URL` (pooler 6543), `DIRECT_URL` (5432, para migraciones).
- **App** — `NEXT_PUBLIC_APP_URL`.
- **tusfacturas.app (AFIP)** — `TUSFACTURAS_USERTOKEN`, `TUSFACTURAS_APIKEY`, `TUSFACTURAS_APITOKEN`, `TUSFACTURAS_RUBRO`, `TUSFACTURAS_RUBRO_GRUPO`.

---

## Scripts

```bash
pnpm dev            # desarrollo local
pnpm build          # build de prod
pnpm start          # servir build
pnpm lint           # eslint
pnpm typecheck      # tsc --noEmit
pnpm format         # prettier --write
pnpm format:check   # prettier --check

pnpm db:generate    # generar migración desde schema (drizzle-kit)
pnpm db:migrate     # aplicar migraciones
pnpm db:push        # push directo del schema (solo dev)
pnpm db:studio      # UI de Drizzle

pnpm seed           # script de seed (scripts/seed.ts)
```

---

## Deploy

Deploy automático en Vercel:

- **Push a `main`** → producción.
- **PR** → preview con URL única.

Flujo recomendado: trabajar en una rama (`feat/...`, `fix/...`, `docs/...`), abrir PR, revisar la preview, mergear a `main`.

---

## Integraciones

- **Supabase** — Auth, Postgres y RLS.
- **tusfacturas.app** — emisión de facturas electrónicas contra AFIP. Cliente y mappers en `src/lib/tusfacturas/`.
- **Vercel Cron** — `src/app/api/cron/mensuales` genera los movimientos mensuales.

---

## Convenciones

- Server Actions en `src/app/actions/` para todas las mutaciones.
- Tipos compartidos en `src/types/`, schema de DB en `src/lib/db/schema.ts`.
- Validación con Zod en los bordes (server actions, route handlers).
- Auth y permisos resueltos en `middleware.ts` + helpers de `src/lib/auth/`.
- Husky + lint-staged corren lint/format en cada commit.
