'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from './logo';
import { logout } from '@/app/actions/auth';
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  Anchor,
  MessageSquare,
  FileText,
  Tag,
  Settings,
  LogOut,
  AlertTriangle,
} from 'lucide-react';

const ROL_LABELS: Record<string, string> = {
  administrador_general: 'Administrador general',
  operario: 'Operario',
  contable: 'Contable',
  mantenimiento: 'Mantenimiento',
  comunicaciones: 'Comunicaciones',
  restaurantes: 'Restaurantes',
  socio: 'Socio',
  invitado: 'Invitado',
  proveedor: 'Proveedor',
};

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/alertas', label: 'Alertas', icon: AlertTriangle },
  { href: '/usuarios', label: 'Usuarios', icon: Users },
  { href: '/tareas', label: 'Tareas', icon: ClipboardList },
  { href: '/dashboard/espacios', label: 'Espacios', icon: Anchor },
  { href: '/dashboard/comunicaciones', label: 'Comunicaciones', icon: MessageSquare },
  { href: '/facturacion', label: 'Facturación', icon: FileText },
  { href: '/tarifario', label: 'Tarifario', icon: Tag },
  { href: '/configuracion', label: 'Configuración', icon: Settings },
];

// El operario solo accede a Tareas desde el admin UI.
const OPERARIO_ALLOWED = new Set(['/tareas']);

type Props = {
  guarderiaName: string;
  userName: string;
  userInitial: string;
  rol: string;
};

export function Sidebar({ guarderiaName, userName, userInitial, rol }: Props) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-gray-200 bg-white">
      {/* Logo + guardería */}
      <div className="px-4 pt-5 pb-3">
        <Logo size={36} />
        <p className="mt-1.5 truncate text-xs text-gray-400">{guarderiaName}</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {NAV.filter(({ href }) => (rol === 'operario' ? OPERARIO_ALLOWED.has(href) : true)).map(
          ({ href, label, icon: Icon }) => {
            const active =
              href === '/dashboard'
                ? pathname === '/dashboard'
                : pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium transition-colors ${
                  active ? 'bg-[#175861] text-white' : 'text-[#364153] hover:bg-gray-100'
                }`}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                {label}
              </Link>
            );
          },
        )}
      </nav>

      {/* User */}
      <div className="border-t border-gray-100 px-4 py-4">
        <div className="flex items-center gap-3">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
            style={{ background: '#E87040' }}
          >
            {userInitial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold" style={{ color: '#101828' }}>
              {userName}
            </p>
            <p className="truncate text-xs text-gray-400">{ROL_LABELS[rol] ?? rol}</p>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="rounded-[6px] p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
              title="Cerrar sesión"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
