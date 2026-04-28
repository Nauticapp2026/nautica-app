# Arquitectura compartida — Náutica App

Conceptos que aplican a **todos** los clients de la plataforma (web admin, app mobile, futuras integraciones). Si trabajás en cualquier repo del producto, leelo primero.

Para detalles específicos de la web (Next.js, server actions, design system) ver `arquitectura-web.md` en este repo. La app mobile tendría su equivalente.

---

## Producto

NauticApp es un SaaS multi-tenant para clubes náuticos / guarderías náuticas. Cada cliente del SaaS es una **guardería** (también llamada "club" o "marina"). Cada guardería gestiona socios, embarcaciones, espacios de guarda, facturación, comunicaciones y operativa de portería.

El acceso al sistema se da por **rol dentro de una guardería** (membership). Un mismo usuario puede pertenecer a varias guarderías con distintos roles.

---

## Plataforma compartida

- **Auth + DB**: Supabase (Postgres). Único proyecto.
- **RLS**: habilitado en todas las tablas relevantes. Las policies son la red de seguridad final, pero la regla es siempre **filtrar también en el código del cliente** (web/mobile).
- **Validación**: Zod en los bordes (cualquier input externo se valida antes de tocar la DB o llamar a APIs externas).
- **Facturación AFIP**: integración con tusfacturas.app para emisión de facturas. Las credenciales `TUSFACTURAS_*` viven en env vars del backend que llame al servicio.

---

## Modelo multi-tenant

La regla más importante: **todo dato operativo se scopea por `guarderia_id`**.

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

`profiles` es global (1:1 con `auth.users`) — un usuario es una sola fila ahí. `memberships` une `profiles` con `guarderias` y guarda el rol.

### Roles

Definidos en `src/config/roles.ts` (en el repo web; el mobile debería tener su mirror).

| Rol                     | Acceso                                                    |
| ----------------------- | --------------------------------------------------------- |
| `administrador_general` | Todo el dashboard web de su guardería.                    |
| `operario`              | Solo `/tareas` en la web.                                 |
| `contable`              | Facturación y reportes en la web.                         |
| `mantenimiento`         | Tareas operativas (mobile principalmente).                |
| `comunicaciones`        | Difusión y avisos.                                        |
| `restaurantes`          | Punto de venta gastronómico.                              |
| `seguridad`             | Portería — opera desde mobile, sin pantallas web propias. |
| `socio`                 | Cliente final del club. Mobile.                           |
| `invitado`              | Visita de un socio. Mobile.                               |
| `proveedor`             | Vendor externo. Mobile.                                   |

### Reglas de scoping (cualquier client)

1. Las queries siempre filtran por `guarderia_id` antes de llamar a la DB.
2. Para joins indirectos (`pisos` → `lados` → `guarderia_id`) se filtra vía la tabla intermedia. Nunca asumir que un id "pertenece" al user sin verificar el scope.
3. Antes de escribir una query: "¿qué pasa si un user de la guardería A llama esto con un id de la guardería B?".
4. RLS es la última línea de defensa, no la primera.

---

## Super admin (cross-tenant)

Excepción al modelo multi-tenant: el `super_admin` administra la **plataforma**, no una guardería.

- **Modelo**: `profiles.is_super_admin` (boolean) + función SQL `public.is_super_admin()` (en migración 0001) usada por las policies RLS para dar bypass cross-tenant.
- Es **distinto** del valor `'super_admin'` del enum `rol`, que es a nivel de membership y prácticamente no se usa.
- En la web vive en `/super-admin/` (panel separado del dashboard del cliente). El mobile NO debería tener pantallas de super admin — toda la administración cross-tenant es web.
- Tablas globales no scopeadas: `pricing_plans`, `platform_settings`. Lectura pública (la landing pública lee de ahí), escritura solo `is_super_admin()`.

---

## Auth flow

1. Login vía Supabase Auth (email/password).
2. Cada client decide a dónde mandar al user post-login según:
   - Tiene memberships activas → según rol del membership activo.
   - Sin memberships pero `is_super_admin` → web `/super-admin` (mobile no aplica, no hay UI de super admin ahí).
   - Sin memberships y no super admin → "no tenés acceso".
3. Las sesiones se refrescan via Supabase SDK (en web, vía middleware).

---

## DB y migraciones

- Schema fuente de verdad: `src/lib/db/schema.ts` en el repo web (Drizzle ORM). Es lo que define los tipos.
- Migraciones SQL: `supabase/migrations/` (en el repo web). Se aplican manualmente en el SQL Editor de Supabase.
- Hay un único proyecto Supabase (prod). No hay dev separado.
- RLS habilitado en cada tabla relevante; todas las policies viven en estas migraciones.

Si el mobile necesita generar tipos, debería **leer del mismo schema** (Drizzle expone types con `InferSelectModel`) o regenerar a partir del Supabase TypeGen.

---

## Integraciones externas

- **Supabase** — Auth, Postgres, RLS.
- **tusfacturas.app** — emisión de facturas AFIP. Cliente y mappers en `src/lib/tusfacturas/` del repo web. Si el mobile factura, idealmente llama a un endpoint del backend web en lugar de duplicar la integración.
- **Vercel Cron** — `src/app/api/cron/mensuales` (web) corre los movimientos mensuales. Es **idempotente** — puede correrse dos veces sin generar duplicados.

---

## Convenciones de equipo

- **Conventional commits en español**: `feat(area): descripcion`, `fix(area): descripcion`, etc.
- **Naming de ramas**: `feat/...`, `fix/...`, `chore/...`, `docs/...`, `refactor/...`.
- **Workflow**: rama → PR → preview → merge a `main`. Nunca pushear directo a `main`.
- **Zona horaria**: todo lo que se muestre al usuario con hora/fecha es `America/Argentina/Buenos_Aires`. Postgres guarda en UTC; convertir al formatear.
