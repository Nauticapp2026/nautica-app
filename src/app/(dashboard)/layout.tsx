import { redirect } from 'next/navigation';
import { getActiveMarina, getPostLoginRedirect } from '@/lib/auth/session';
import { yaAceptoVersionVigente } from '@/lib/auth/terminos';
import { Sidebar } from '@/components/shared/sidebar';
import { GuarderiaInactivaScreen } from '@/components/shared/guarderia-inactiva-screen';

// Roles con acceso al dashboard web. El resto (socio, invitado, etc.)
// se gestiona desde la app mobile.
const WEB_DASHBOARD_ROLES = ['administrador_general', 'administrativo', 'operario'] as const;

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getActiveMarina();
  if (!ctx) {
    // Super admin sin membership en ninguna guardería va al panel de plataforma.
    // Resto cae en /no-access.
    const target = await getPostLoginRedirect();
    redirect(target === '/dashboard' ? '/no-access' : target);
  }

  const { profile, activeMembership, activeGuarderia } = ctx;

  const hasWebAccess =
    profile.isSuperAdmin ||
    (WEB_DASHBOARD_ROLES as readonly string[]).includes(activeMembership.rol);
  if (!hasWebAccess) redirect('/no-access');

  // Gate de Términos y Condiciones. El super admin queda exento — es quien
  // publica las nuevas versiones, sería raro que se trabe a sí mismo.
  if (!profile.isSuperAdmin) {
    const aceptado = await yaAceptoVersionVigente(profile.id);
    if (!aceptado) redirect('/terminos/aceptar');
  }

  // Si la guardería todavía no fue activada por el super admin, los usuarios
  // de esa guardería no pueden operar. El super admin sí pasa, para poder
  // testear / configurar antes de habilitar.
  if (!profile.isSuperAdmin && !activeGuarderia.activa) {
    return <GuarderiaInactivaScreen guarderiaNombre={activeGuarderia.nombre} />;
  }

  const userName = profile.nombre
    ? `${profile.nombre} ${profile.apellido ?? ''}`.trim()
    : profile.email;

  const userInitial = (profile.nombre?.[0] ?? profile.email[0]).toUpperCase();

  return (
    <div className="flex min-h-screen flex-col bg-[#F9FAFB] md:flex-row">
      <Sidebar
        subtitle={activeGuarderia.nombre}
        userName={userName}
        userInitial={userInitial}
        rol={activeMembership.rol}
      />
      <main className="min-w-0 flex-1 overflow-auto">{children}</main>
    </div>
  );
}
