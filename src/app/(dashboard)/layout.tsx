import { redirect } from 'next/navigation';
import { getActiveMarina } from '@/lib/auth/session';
import { Sidebar } from '@/components/shared/sidebar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getActiveMarina();
  if (!ctx) redirect('/no-access');

  const { profile, activeMembership, activeGuarderia } = ctx;

  const userName = profile.nombre
    ? `${profile.nombre} ${profile.apellido ?? ''}`.trim()
    : profile.email;

  const userInitial = (profile.nombre?.[0] ?? profile.email[0]).toUpperCase();

  return (
    <div className="flex min-h-screen bg-[#F9FAFB]">
      <Sidebar
        guarderiaName={activeGuarderia.nombre}
        userName={userName}
        userInitial={userInitial}
        rol={activeMembership.rol}
      />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
