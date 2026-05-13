'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  Menu,
  X,
  Building2,
  Bell,
  MessageCircle,
  Megaphone,
  type LucideIcon,
} from 'lucide-react';

const ROL_LABELS: Record<string, string> = {
  super_admin: 'Super admin',
  administrador_general: 'Admin',
  administrativo: 'Administrativo',
  operario: 'Operario',
  contable: 'Contable',
  mantenimiento: 'Mantenimiento',
  comunicaciones: 'Comunicaciones',
  restaurantes: 'Restaurantes',
  socio: 'Socio',
  invitado: 'Invitado',
  proveedor: 'Proveedor',
  seguridad: 'Portería / Seguridad',
};

type SidebarItem = { href: string; label: string; icon: LucideIcon };

export type SidebarVariant = 'dashboard' | 'super-admin';

// Los navs viven dentro de este modulo 'use client' a proposito: las icon
// components de lucide son funciones de React y no se pueden pasar como
// prop desde un Server Component a un Client Component (cruzar el bound
// los serializa). Asi que en lugar de aceptar items por prop, recibimos
// `variant` y resolvemos el nav aca adentro.
const NAV_BY_VARIANT: Record<SidebarVariant, SidebarItem[]> = {
  dashboard: [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/usuarios', label: 'Usuarios', icon: Users },
    { href: '/tareas', label: 'Tareas', icon: ClipboardList },
    { href: '/espacios', label: 'Espacios', icon: Anchor },
    { href: '/comunicaciones', label: 'Comunicaciones', icon: MessageSquare },
    { href: '/facturacion', label: 'Facturación', icon: FileText },
    { href: '/tarifario', label: 'Tarifario', icon: Tag },
    { href: '/configuracion', label: 'Configuración', icon: Settings },
  ],
  'super-admin': [
    { href: '/super-admin', label: 'Inicio', icon: LayoutDashboard },
    { href: '/super-admin/guarderias', label: 'Guarderías', icon: Building2 },
    { href: '/super-admin/usuarios', label: 'Usuarios', icon: Users },
    { href: '/super-admin/comunicaciones', label: 'Comunicaciones', icon: MessageSquare },
    { href: '/super-admin/publicidades', label: 'Publicidades', icon: Megaphone },
    { href: '/super-admin/notificaciones', label: 'Notificaciones', icon: Bell },
    { href: '/super-admin/pricing', label: 'Pricing', icon: Tag },
  ],
};

// El operario solo accede a Tareas desde el admin UI.
const OPERARIO_ALLOWED = new Set(['/tareas']);

type Props = {
  subtitle: string;
  userName: string;
  userInitial: string;
  rol: string;
  variant?: SidebarVariant;
};

export function Sidebar({ subtitle, userName, userInitial, rol, variant = 'dashboard' }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const baseItems = NAV_BY_VARIANT[variant];
  const items =
    variant === 'dashboard'
      ? baseItems.filter(({ href }) => (rol === 'operario' ? OPERARIO_ALLOWED.has(href) : true))
      : baseItems;

  return (
    <>
      {/* Top bar mobile: solo visible <md. Es lo que toma el espacio del
          sidebar en el flex-col del layout (el aside abajo es fixed en mobile). */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2.5 md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="-ml-1 rounded-md p-2 text-gray-600 hover:bg-gray-100"
          aria-label="Abrir menú"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Image src="/logo-nauticapp.png" alt="NauticApp" width={92} height={32} priority />
        <div className="w-9" aria-hidden />
      </div>

      {/* Backdrop mobile */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          aria-hidden
        />
      )}

      {/* Aside: drawer fijo deslizable en mobile, sticky en desktop. */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-gray-200 bg-white transition-transform duration-200 md:sticky md:top-0 md:h-screen md:w-56 md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Botón cerrar en mobile */}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="absolute top-3 right-3 rounded-md p-1.5 text-gray-500 hover:bg-gray-100 md:hidden"
          aria-label="Cerrar menú"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Logo + subtítulo */}
        <div className="px-4 pt-5 pb-3">
          <Image src="/logo-nauticapp.png" alt="NauticApp" width={120} height={42} priority />
          <p className="mt-1.5 truncate text-xs text-gray-400">{subtitle}</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
          {items.map(({ href, label, icon: Icon }) => {
            // Si este item es prefijo de otro (ej. /super-admin con
            // /super-admin/pricing), solo se activa con match exacto. Si no,
            // matchea también subpaths para que /usuarios/123 deje
            // /usuarios resaltado.
            const hasChildren = items.some(
              (other) => other.href !== href && other.href.startsWith(href + '/'),
            );
            const active = hasChildren
              ? pathname === href
              : pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium transition-colors ${
                  active ? 'bg-[#175861] text-white' : 'text-[#364153] hover:bg-gray-100'
                }`}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Botón de soporte: solo en dashboard (admin + operario), no en super-admin. */}
        {variant === 'dashboard' && <SoporteButton />}

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
    </>
  );
}

// El número de soporte vive en NEXT_PUBLIC_SOPORTE_TEL (Vercel). El click
// abre WhatsApp (wa.me/<numero>) en una pestaña nueva — funciona consistente
// en mobile y desktop, a diferencia de tel: que en desktop depende de la
// app que tenga el navegador asociada. Si la env no esta seteada, el boton
// se ve pero el click no hace nada.
function SoporteButton() {
  const tel = process.env.NEXT_PUBLIC_SOPORTE_TEL?.trim();
  // wa.me espera solo digitos (sin +, espacios o guiones).
  const numero = tel?.replace(/\D/g, '');
  const href = numero ? `https://wa.me/${numero}` : '#';

  return (
    <div className="px-3 pt-2 pb-3">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 rounded-[14px] border border-[#D6E5E6] bg-[#F4F8F8] p-2.5 transition-colors hover:bg-[#E8F0F1]"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#669E9D] text-white">
          <MessageCircle className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block text-sm font-bold text-[#175861]">¿Necesitas ayuda?</span>
          <span className="block text-xs text-gray-500">Soporte por WhatsApp</span>
        </span>
      </a>
    </div>
  );
}
