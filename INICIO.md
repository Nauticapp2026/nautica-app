# 🚤 Náutica App — Paquete inicial

Este ZIP contiene todos los archivos base de **Fase 0** (setup) y **Fase 1** (auth, roles y multi-tenancy).

## 📋 Cómo usar este ZIP

### Paso 1 — Clonar tu repo vacío de GitHub

```bash
cd ~/ruta/donde/tenes/tus/proyectos
git clone https://github.com/TU_USUARIO/nautica-app.git
cd nautica-app
```

### Paso 2 — Generar el proyecto Next.js

Dentro de la carpeta `nautica-app` vacía (debería tener solo `.git` y quizás un `README.md`):

```bash
pnpm create next-app@latest . \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --use-pnpm
```

Cuando pregunte si querés sobreescribir el README, decí que sí.

### Paso 3 — Copiar los archivos del ZIP

Descomprimí el ZIP y copiá **todo su contenido** encima de la carpeta del proyecto. Los archivos van a:

- Reemplazar el `README.md` del generador con el nuestro.
- Agregar configs (`.prettierrc.json`, `.lintstagedrc.json`, `.env.example`, `drizzle.config.ts`).
- Agregar carpetas `src/app/(auth)`, `src/app/(dashboard)`, `src/lib/`, `src/config/`, `src/components/shared/`.
- Agregar `supabase/migrations/`, `scripts/`, `docs/`, `.github/workflows/`, `.vscode/`.

### Paso 4 — Mergear scripts al package.json

Abrí `docs/package-scripts.jsonc`, copiá el bloque `"scripts"` y pegalo en tu `package.json` real reemplazando el que tenía.

### Paso 5 — Instalar dependencias

```bash
pnpm add @supabase/supabase-js @supabase/ssr
pnpm add drizzle-orm postgres zod
pnpm add react-hook-form @hookform/resolvers
pnpm add lucide-react class-variance-authority clsx tailwind-merge
pnpm add dotenv

pnpm add -D drizzle-kit @types/node tsx
pnpm add -D prettier prettier-plugin-tailwindcss
pnpm add -D husky lint-staged
```

### Paso 6 — Inicializar shadcn/ui

```bash
pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add button input label card form
```

### Paso 7 — Seguir el README principal

A partir de acá, seguí `README.md` (secciones 5 en adelante: Supabase, variables de entorno, GitHub, Vercel, Husky) y después `docs/PHASE-1.md` para correr la migración SQL y el seed.

---

## 📁 Contenido del ZIP

```
nautica-app/
├── .github/workflows/ci.yml         # CI con lint + typecheck
├── .vscode/                         # Configuración recomendada de VS Code
├── docs/
│   ├── PHASE-1.md                   # Guía completa de Fase 1
│   └── package-scripts.jsonc        # Scripts a mergear
├── scripts/seed.ts                  # Bootstrap de super_admin + guardería
├── src/
│   ├── app/
│   │   ├── (auth)/                  # login, signup, accept-invite
│   │   ├── (dashboard)/             # layout + página del dashboard
│   │   ├── actions/                 # Server Actions (auth, invitations)
│   │   ├── auth/callback/           # OAuth callback
│   │   └── no-access/               # Usuario sin guardería
│   ├── components/shared/           # MarinaSwitcher, UserMenu
│   ├── config/roles.ts              # Definición de roles
│   ├── lib/
│   │   ├── auth/session.ts          # Helpers de sesión
│   │   ├── db/                      # Drizzle (schema + client)
│   │   └── supabase/                # Clientes (browser, server, admin)
│   └── middleware.ts                # Refresh automático de sesión
├── supabase/migrations/
│   └── 0001_phase1_auth_rls.sql     # RLS, funciones, triggers
├── .env.example
├── .gitignore
├── .lintstagedrc.json
├── .prettierrc.json
├── drizzle.config.ts
└── README.md
```

¡Éxitos! 🎉
