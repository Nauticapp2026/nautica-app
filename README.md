# Náutica App

SaaS multi-tenant para guarderías náuticas: gestión de espacios y embarcaciones, socios, tareas operativas, tarifario, facturación electrónica (AFIP vía tusfacturas.app), comunicaciones, notificaciones push y QR para invitados.

**Stack:** Next.js 16 · React 19 · TypeScript · Supabase (Auth + Postgres + RLS) · Drizzle ORM · Tailwind 4 · shadcn/ui · Vercel

---

## Features

- **Multi-tenant** — cada club opera en su propio silo. Toda la data está scopeada por `guarderia_id` con RLS en Supabase.
- **Onboarding guiado** — wizard de 10 pasos: alta de cuenta, datos del club, horarios, equipo, espacios, elección de plan, info de pago, demo con Calendly y aceptación de T&C.
- **Dashboard operativo** — alertas en tiempo real (movimientos, vencimientos, salidas pendientes) en zona horaria Argentina.
- **Espacios y embarcaciones** — estructura jerárquica (marinas/naves → pisos → espacios), asignación de embarcaciones, reordenamiento drag-and-drop, mudanzas entre espacios.
- **Socios** — alta individual o carga masiva (`.xlsx`), perfil completo con embarcaciones, historial de movimientos y facturación.
- **Solicitudes de membresía** — flujo mobile → web: el socio solicita desde la app, el admin valida y aprueba; notificación por email vía Resend.
- **Tareas** — admin crea y asigna; operario ve y resuelve. Vinculadas a salidas/entradas y lavados.
- **Tarifario** — definición de tarifas por servicio y unidad (metros / pies).
- **Facturación** — movimientos mensuales automáticos (Vercel Cron), emisión de facturas A/B/C contra AFIP vía tusfacturas.app, saldo a favor, certificado AFIP.
- **Comunicaciones** — envío masivo a socios del club.
- **Notificaciones push** — Expo Push a iOS/Android, segmentadas por plan (esencial / premium / elite). Envío inline + cron diario.
- **Planes** — tres planes DB-driven (Esencial, Premium, Élite) con features configurables desde el panel super admin.
- **Super admin** — panel cross-tenant para gestionar guarderías, usuarios globales, comunicaciones, publicidades, pricing y Términos y Condiciones.
- **QR público** — vistas de embarcación e invitado para escaneo en el muelle, sin login.
- **Mareas** — endpoint `/api/mareas` con scraper del SHN (Servicio de Hidrografía Naval).
- **Términos y Condiciones** — versiones publicables desde super admin; gate en el dashboard hasta aceptación.
- **Política de privacidad** — página pública en `/privacidad`.
- **Responsive** — sidebar con drawer en mobile; pantallas pensadas para uso desde celular en muelle.

---

## Roles

| Rol                     | Acceso                                                          |
| ----------------------- | --------------------------------------------------------------- |
| `administrador_general` | Acceso total dentro de su guardería                             |
| `administrativo`        | Igual que `administrador_general` (mismos permisos)             |
| `operario`              | Tareas asignadas y operativa básica                             |
| `seguridad`             | Portería — opera desde la app mobile, sin pantallas web propias |
| `contable`              | Facturación y movimientos                                       |
| `comunicaciones`        | Comunicaciones y notificaciones                                 |
| `mantenimiento`         | Tareas de mantenimiento                                         |
| `restaurantes`          | Módulo gastronómico                                             |
| `socio`                 | App mobile únicamente                                           |

El **super admin** no es un rol de guardería sino un flag en `profiles.is_super_admin`. Tiene acceso al panel `/super-admin/` y bypass de RLS.

Definidos en `src/config/roles.ts`.

---

## Estructura

```
src/
├── app/
│   ├── (auth)/                 # login, signup, accept-invite, reset-password
│   ├── (onboarding)/           # wizard de alta de guardería (10 pasos)
│   ├── (dashboard)/
│   │   ├── (admin)/            # dashboard, usuarios, solicitudes-socio,
│   │   │                       # espacios, tarifario, facturación,
│   │   │                       # comunicaciones, configuración
│   │   └── tareas/             # accesible por admin y operario
│   ├── super-admin/            # panel cross-tenant: guarderías, usuarios,
│   │                           # comunicaciones, publicidades,
│   │                           # notificaciones, pricing, términos
│   ├── api/
│   │   ├── cron/               # mensuales, notificaciones-push, historial-plan
│   │   ├── devices/register/   # registro de tokens push
│   │   ├── mareas/             # scraper SHN
│   │   └── webhooks/tusfacturas/
│   ├── qr/                     # vistas QR públicas (embarcación / invitado)
│   ├── terminos/               # T&C público + flujo de aceptación
│   ├── privacidad/             # política de privacidad
│   ├── actions/                # server actions (auth, espacios, tareas,
│   │                           # facturación, onboarding, comunicaciones,
│   │                           # solicitudes, términos, bulk-import, etc.)
│   │   └── super-admin/        # actions del panel super admin
│   └── page.tsx                # landing pública con pricing
│
├── components/
│   ├── ui/                     # shadcn/ui
│   ├── shared/                 # sidebar, marina-switcher, user-menu,
│   │                           # markdown-view, qr-code, etc.
│   └── landing/                # secciones de la home pública
│
├── lib/
│   ├── supabase/               # clients server / browser / admin
│   ├── db/                     # drizzle schema + conexión
│   ├── auth/                   # session helpers, errors, términos
│   ├── email/                  # resend client + templates
│   ├── tusfacturas/            # client + mappers para AFIP
│   ├── pricing/                # config de planes + historial
│   ├── push-notifications.ts   # Expo Push API
│   ├── auto-facturacion.ts     # lógica de facturación automática
│   ├── movimientos-mensuales.ts
│   └── shn.ts                  # mareas (SHN scraper)
│
├── config/
│   └── roles.ts                # definición de roles y grupos
│
└── middleware.ts               # auth + redirección por rol + pre-launch gate
```

---

## Setup local

### Prerrequisitos

- Node.js 20+
- pnpm 9+
- Acceso al proyecto Supabase y credenciales de tusfacturas.app

### Pasos

```bash
git clone git@github.com:Nauticapp2026/nautica-app.git
cd nautica-app
pnpm install

cp .env.example .env.local
# completar .env.local con los valores (ver sección siguiente)

pnpm dev
```

App en `http://localhost:3000`.

---

## Variables de entorno

Ver `.env.example` para la lista completa.

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Drizzle (Postgres)
DATABASE_URL=          # pooler puerto 6543 (serverless)
DIRECT_URL=            # direct puerto 5432 (migraciones)

# App
NEXT_PUBLIC_APP_URL=   # con www en prod (ej. https://www.nauticapp.club)
NEXT_PUBLIC_SOPORTE_TEL=

# Pre-launch gate (Basic Auth — borrar en Vercel para destrabar al lanzar)
PRELAUNCH_GATE_USER=
PRELAUNCH_GATE_PASSWORD=

# Resend (emails transaccionales)
RESEND_API_KEY=

# TusFacturas / AFIP
TUSFACTURAS_USERTOKEN=
TUSFACTURAS_APIKEY=
TUSFACTURAS_APITOKEN=
TUSFACTURAS_RUBRO_GRUPO=Servicios
TUSFACTURAS_WEBHOOK_SECRET=

# Expo Push Notifications (opcional — aumenta rate limits)
EXPO_ACCESS_TOKEN=
```

> **Nota sobre `NEXT_PUBLIC_APP_URL`**: debe incluir `www` en producción. TusFacturas rechaza el alta del POS si la URL hace redirect (307) — y el dominio sin www redirige al con www.

---

## Scripts

```bash
pnpm dev              # desarrollo local
pnpm build            # build de prod
pnpm typecheck        # tsc --noEmit
pnpm lint             # eslint
pnpm format           # prettier --write
pnpm format:check     # prettier --check

pnpm db:studio        # UI de Drizzle para inspeccionar la DB
```

> `pnpm db:generate` está roto en este repo — las migraciones se escriben a mano en `supabase/migrations/` y se aplican desde el SQL Editor de Supabase.

---

## Migraciones

Las migraciones van en `supabase/migrations/` con el formato `XXXX_descripcion.sql`. Incluyen DDL, RLS policies, triggers y funciones PL/pgSQL. Se aplican manualmente desde el SQL Editor de Supabase (no con `drizzle-kit migrate`).

---

## Deploy

Deploy automático en Vercel:

- **Push a `main`** → producción.
- **PR** → preview con URL única.

Flujo: rama (`feat/...`, `fix/...`, `chore/...`) → PR → revisar preview → merge a `main`. Nunca pushear directo a `main`.

---

## Integraciones

| Servicio            | Propósito                                                                                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Supabase**        | Auth, Postgres, RLS, Storage                                                                                                                                                        |
| **Resend**          | Emails transaccionales (invitaciones, aprobación de socios)                                                                                                                         |
| **tusfacturas.app** | Facturación electrónica AFIP (facturas A/B/C)                                                                                                                                       |
| **Expo Push**       | Notificaciones push a iOS/Android                                                                                                                                                   |
| **Vercel Cron**     | Jobs automáticos: movimientos mensuales, push diario, historial de plan                                                                                                             |
| **SHN**             | Scraper de mareas del Servicio de Hidrografía Naval                                                                                                                                 |
| **Calendly**        | Agenda de demo en el onboarding (paso 8)                                                                                                                                            |
| **App mobile**      | Repo separado que comparte la misma DB Supabase. Tablas compartidas: `solicitudes_lavado`, `porteria_invitados`, `actividad_porteria`, `tareas`, `notificaciones`, `device_tokens`. |

---

## Convenciones

- Server Actions en `src/app/actions/` para todas las mutaciones. Los `api/` solo para webhooks y crons.
- Tipos inferidos desde el schema de Drizzle (`InferSelectModel`, `InferInsertModel`).
- Validación con Zod en todos los bordes (server actions, route handlers).
- Auth y permisos: `middleware.ts` + helpers de `src/lib/auth/session.ts`.
- Zona horaria Argentina (`America/Argentina/Buenos_Aires`) en todo lo que se muestre al usuario.
- Husky + lint-staged corren lint/prettier en cada commit.
