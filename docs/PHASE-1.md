# Fase 1 — Auth, roles y multi-tenancy

Esta fase implementa autenticación, gestión de roles y aislamiento entre guarderías vía Row Level Security de Postgres.

## Checklist de ejecución

### 1. Copiar archivos nuevos al repo

Todos los archivos de esta fase están en el mismo árbol. Solo copialos.

### 2. Instalar nuevas dependencias

```bash
pnpm add dotenv
pnpm add -D tsx
```

Agregar al `package.json`:

```json
{
  "scripts": {
    "seed": "tsx scripts/seed.ts"
  }
}
```

### 3. Generar tablas con Drizzle

```bash
pnpm db:generate    # crea SQL en /drizzle
pnpm db:push        # aplica el schema a Supabase
```

### 4. Aplicar la migración RLS

En el SQL Editor de Supabase (o vía CLI), ejecutar:

```
supabase/migrations/0001_phase1_auth_rls.sql
```

Esto crea: FK a `auth.users`, trigger de profile automático, funciones de autorización
(`is_super_admin`, `is_marina_member`, `is_marina_admin`, `marina_role`), políticas RLS
y la función `accept_invitation`.

### 5. Bootstrapear el super_admin

1. Correr `pnpm dev` y entrar a `/signup`. Registrate con tu email.
2. Confirmar el email (revisar bandeja).
3. Agregar al `.env.local`:
   ```
   SUPER_ADMIN_EMAIL=tu-email@dominio.com
   SEED_MARINA_NAME="Nombre guardería"
   SEED_MARINA_SLUG="mi-guarderia"
   ```
4. Correr `pnpm seed`.
5. Volvé a loguearte en `/login` → te manda a `/dashboard`.

### 6. Probar flujo de invitaciones

Desde el dashboard (TODO: pantalla de gestión de equipo en Fase 1.5) o directamente
insertando en `invitations` vía Supabase Studio, probá:

1. Crear una invitación con `marina_id`, `email`, `role`, `token` (generar uno random).
2. Visitar `/accept-invite?token=TOKEN_GENERADO` en sesión anónima.
3. Registrarse → se acepta la invitación → el user aparece con la membership correcta.

---

## Cómo funciona el multi-tenancy

1. **Un user** (registro en `auth.users` + `profiles`).
2. **Pertenece a 0..N guarderías** vía `memberships(user_id, marina_id, role)`.
3. **La guardería activa** se guarda en cookie httpOnly `active_marina_id`.
4. **Todas las queries de negocio** (desde Fase 2 en adelante) filtran por `marina_id`.
5. **RLS garantiza el aislamiento** a nivel DB: aunque la app tenga un bug,
   la base rechaza lecturas/escrituras fuera de la guardería del user.

## Helpers clave

- `getCurrentUser()` — user autenticado o null
- `requireUser()` — user o redirect a /login
- `getUserContext()` — user + profile + todas las memberships
- `getActiveMarina()` — user + membership activa + marina activa
- `requireRole(['marina_admin'])` — exige rol específico

## Lo que sigue

Fase 1.5 (opcional pero muy recomendada antes de Fase 2):

- Página `/dashboard/team` para invitar y gestionar miembros.
- Panel de super_admin para crear guarderías.
- Integración de emails de invitación con Resend.

Fase 2:

- Modelo de `spaces`, `boats`, asignaciones.
- Primer módulo de negocio real.
