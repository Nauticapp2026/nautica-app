import { redirect } from 'next/navigation';
import { getActiveMarina } from '@/lib/auth/session';
import { MarinaSwitcher } from '@/components/shared/marina-switcher';
import { UserMenu } from '@/components/shared/user-menu';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getActiveMarina();

  if (!ctx) {
    // Usuario sin ninguna guardería: podría pasar si recién se registró y no
    // aceptó una invitación. Mostrar pantalla de "sin guarderías".
    redirect('/no-access');
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 items-center justify-between border-b px-4">
        <div className="flex items-center gap-4">
          <span className="font-semibold">Náutica</span>
          <MarinaSwitcher
            memberships={ctx.memberships}
            activeGuarderiaId={ctx.activeMembership.guarderiaId}
          />
        </div>
        <UserMenu
          email={ctx.profile.email}
          fullName={
            ctx.profile.nombre ? `${ctx.profile.nombre} ${ctx.profile.apellido ?? ''}`.trim() : null
          }
          rol={ctx.activeMembership.rol}
        />
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
