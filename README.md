# Náutica App

Plataforma multi-tenant para guarderías náuticas.

**Stack:** Next.js 15 (App Router) · TypeScript · Supabase · Tailwind · shadcn/ui · Drizzle ORM · Vercel

---

## Fase 0 — Setup inicial

### 1. Prerrequisitos

- Node.js 20+ (`node -v`)
- pnpm 9+ (`npm i -g pnpm`)
- Cuenta en [GitHub](https://github.com), [Vercel](https://vercel.com), [Supabase](https://supabase.com)
- VS Code con extensiones recomendadas (ver `.vscode/extensions.json`)

### 2. Crear el proyecto Next.js

```bash
pnpm create next-app@latest nautica-app \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --use-pnpm

cd nautica-app
```

### 3. Instalar dependencias base

```bash
# Supabase
pnpm add @supabase/supabase-js @supabase/ssr

# ORM y validación
pnpm add drizzle-orm postgres zod

# UI y formularios
pnpm add react-hook-form @hookform/resolvers
pnpm add lucide-react class-variance-authority clsx tailwind-merge

# Dev
pnpm add -D drizzle-kit @types/node
pnpm add -D prettier prettier-plugin-tailwindcss
pnpm add -D husky lint-staged
```

### 4. Inicializar shadcn/ui

```bash
pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add button input label card form toast
```

### 5. Crear los proyectos en Supabase

Creá dos proyectos en Supabase (dashboard → New project):

- `nautica-dev`
- `nautica-prod`

De cada uno, anotá:

- Project URL
- `anon` public key
- `service_role` key (¡nunca la expongas al cliente!)
- Connection string de Postgres (Settings → Database → Connection string → URI)

### 6. Variables de entorno

Copiá `.env.example` a `.env.local` y completá con los valores del proyecto de dev.

### 7. Subir a GitHub

```bash
git init
git add .
git commit -m "chore: initial setup (phase 0)"
git branch -M main
git remote add origin git@github.com:TU_USUARIO/nautica-app.git
git push -u origin main
```

### 8. Conectar a Vercel

1. Vercel → Add New Project → Import from GitHub → seleccionar `nautica-app`.
2. Framework: Next.js (autodetectado).
3. Environment Variables: pegar las mismas del `.env.local` pero con valores de **prod**.
4. Deploy.

Cada push a `main` deploya a producción. Cada PR genera una preview automática.

### 9. Activar Husky

```bash
pnpm exec husky init
echo "pnpm lint-staged" > .husky/pre-commit
```

---

## Estructura de carpetas

```
nautica-app/
├── src/
│   ├── app/                    # App Router (rutas)
│   │   ├── (auth)/             # login, signup, invitaciones
│   │   ├── (dashboard)/        # app autenticada
│   │   ├── (marketing)/        # landing pública
│   │   └── api/                # route handlers
│   ├── components/
│   │   ├── ui/                 # shadcn/ui
│   │   └── shared/             # componentes propios reusables
│   ├── lib/
│   │   ├── supabase/           # clients (server, browser, admin)
│   │   ├── db/                 # drizzle schema y queries
│   │   ├── auth/               # helpers de sesión y roles
│   │   └── utils.ts
│   ├── types/                  # tipos compartidos
│   └── config/                 # constantes (roles, etc.)
├── drizzle/                    # migraciones generadas
├── public/
└── ...
```

---

## Scripts útiles

```bash
pnpm dev              # desarrollo local
pnpm build            # build de prod
pnpm lint             # eslint
pnpm format           # prettier
pnpm db:generate      # generar migración desde schema
pnpm db:migrate       # aplicar migraciones
pnpm db:studio        # UI para la DB
```

---

## Próximas fases

- **Fase 1:** Auth, roles y multi-tenancy con RLS.
- **Fase 2:** Espacios y embarcaciones.
- **Fase 3:** Tarifas y facturación.
- ...
