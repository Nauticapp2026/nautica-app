import { LayoutDashboard, Tag } from 'lucide-react';
import { requireSuperAdmin } from '@/lib/auth/session';
import { Sidebar, type SidebarItem } from '@/components/shared/sidebar';

const SUPER_ADMIN_NAV: SidebarItem[] = [
  { href: '/super-admin', label: 'Inicio', icon: LayoutDashboard },
  { href: '/super-admin/pricing', label: 'Pricing', icon: Tag },
];

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireSuperAdmin();

  const userName = profile.nombre
    ? `${profile.nombre} ${profile.apellido ?? ''}`.trim()
    : profile.email;

  const userInitial = (profile.nombre?.[0] ?? profile.email[0]).toUpperCase();

  return (
    <div className="flex min-h-screen flex-col bg-[#F9FAFB] md:flex-row">
      <Sidebar
        subtitle="Plataforma"
        userName={userName}
        userInitial={userInitial}
        rol="super_admin"
        items={SUPER_ADMIN_NAV}
      />
      <main className="min-w-0 flex-1 overflow-auto">{children}</main>
    </div>
  );
}
