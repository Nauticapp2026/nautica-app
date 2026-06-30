import { redirect } from 'next/navigation';
import { getActiveMarina } from '@/lib/auth/session';

// Gate de rutas admin-only: si el usuario es operario o marinero, lo
// redirigimos a /tareas (su única sección disponible). Los roles web
// (admin_general, super_admin) pasan sin cambio. El gate de acceso web general
// está en el layout padre.
const STAFF_TAREAS_ROLES = ['operario', 'marinero'];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getActiveMarina();
  if (!ctx) redirect('/login');

  if (!ctx.profile.isSuperAdmin && STAFF_TAREAS_ROLES.includes(ctx.activeMembership.rol)) {
    redirect('/tareas');
  }

  return <>{children}</>;
}
