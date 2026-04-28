import Link from 'next/link';
import { requireSuperAdmin } from '@/lib/auth/session';

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireSuperAdmin();

  const userName = profile.nombre
    ? `${profile.nombre} ${profile.apellido ?? ''}`.trim()
    : profile.email;

  return (
    <div className="flex min-h-screen flex-col bg-[#F9FAFB]">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 md:px-8">
          <div className="flex items-center gap-6">
            <Link href="/super-admin" className="text-lg font-bold text-[#175861]">
              Super Admin
            </Link>
            <nav className="flex gap-4 text-sm font-semibold text-[#677B85]">
              <Link href="/super-admin/pricing" className="hover:text-[#175861]">
                Pricing
              </Link>
            </nav>
          </div>
          <div className="text-sm text-[#677B85]">{userName}</div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-8">{children}</main>
    </div>
  );
}
