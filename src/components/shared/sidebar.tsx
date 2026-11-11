'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logout } from '@/app/actions/auth';
import {
  LayoutDashboard,
  Users,
  UserPlus,
  ClipboardList,
  Anchor,
  MessageSquare,
  Tag,
  Settings,
  LogOut,
  Menu,
  Newspaper,
  X,
  Building2,
  Bell,
  MessageCircle,
  Megaphone,
  Scale,
  Shield,
  ShoppingCart,
  Wallet,
  Landmark,
  Contact,
  Truck,
  Wrench,
  Ship,
  Banknote,
  Briefcase,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react';

const ROL_LABELS: Record<string, string> = {
  super_admin: 'Super admin',
  administrador_general: 'Admin',
  administrativo: 'Administrativo',
  operario: 'Operario',
  marinero: 'Marinero',
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
type SidebarGroup = { id: string; label: string; icon: LucideIcon; items: SidebarItem[] };
type NavEntry = SidebarItem | SidebarGroup;

const esGrupo = (e: NavEntry): e is SidebarGroup => 'items' in e;

export type SidebarVariant = 'dashboard' | 'super-admin';

// Los navs viven dentro de este modulo 'use client' a proposito: las icon
// components de lucide son funciones de React y no se pueden pasar como
// prop desde un Server Component a un Client Component (cruzar el bound
// los serializa). Asi que en lugar de aceptar items por prop, recibimos
// `variant` y resolvemos el nav aca adentro.
//
// El menú del club va en carpetas (grupos que se abren y se cierran) porque con
// todas las secciones sueltas quedaba muy largo. Si agregás una sección nueva,
// ponela en el grupo que corresponda; los items sueltos son los de uso diario.
const NAV_BY_VARIANT: Record<SidebarVariant, NavEntry[]> = {
  dashboard: [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    {
      id: 'operacion',
      label: 'Operación',
      icon: Ship,
      items: [
        { href: '/usuarios', label: 'Socios', icon: Users },
        { href: '/solicitudes-socio', label: 'Solicitudes', icon: UserPlus },
        { href: '/tareas', label: 'Tareas', icon: ClipboardList },
        { href: '/espacios', label: 'Espacios', icon: Anchor },
      ],
    },
    {
      id: 'finanzas',
      label: 'Finanzas',
      icon: Banknote,
      items: [
        { href: '/ventas', label: 'Ventas', icon: ShoppingCart },
        { href: '/cobranzas', label: 'Cobranzas', icon: Wallet },
        { href: '/tesoreria', label: 'Tesorería', icon: Landmark },
        { href: '/tarifario', label: 'Tarifario', icon: Tag },
      ],
    },
    {
      id: 'administracion',
      label: 'Administración',
      icon: Briefcase,
      items: [
        { href: '/personal', label: 'Personal', icon: Contact },
        { href: '/proveedores', label: 'Proveedores', icon: Truck },
        { href: '/bienes-de-uso', label: 'Bienes de uso', icon: Wrench },
      ],
    },
    {
      id: 'comunicacion',
      label: 'Comunicación',
      icon: Megaphone,
      items: [
        { href: '/publicaciones', label: 'Publicaciones', icon: Newspaper },
        { href: '/comunicaciones', label: 'Comunicaciones', icon: MessageSquare },
      ],
    },
    { href: '/configuracion', label: 'Mi perfil', icon: Settings },
  ],
  'super-admin': [
    { href: '/super-admin', label: 'Inicio', icon: LayoutDashboard },
    { href: '/super-admin/guarderias', label: 'Guarderías', icon: Building2 },
    { href: '/super-admin/usuarios', label: 'Usuarios', icon: Users },
    { href: '/super-admin/salidas', label: 'Salidas', icon: Anchor },
    { href: '/super-admin/comunicaciones', label: 'Comunicaciones', icon: MessageSquare },
    { href: '/super-admin/publicidades', label: 'Publicidades', icon: Megaphone },
    { href: '/super-admin/notificaciones', label: 'Notificaciones', icon: Bell },
    { href: '/super-admin/moderacion', label: 'Moderación', icon: Shield },
    { href: '/super-admin/pricing', label: 'Pricing', icon: Tag },
    { href: '/super-admin/terminos', label: 'Términos', icon: Scale },
  ],
};

function Badge({ n, active }: { n: number; active: boolean }) {
  if (n <= 0) return null;
  return (
    <span
      className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
        active ? 'bg-white/25 text-white' : 'bg-red-500 text-white'
      }`}
    >
      {n > 99 ? '99+' : n}
    </span>
  );
}

// Carpetas abiertas del menú, recordadas en este navegador. Es un "store" externo mínimo para
// leer localStorage sin desfasar el render del servidor (que siempre arranca con todo cerrado)
// del primero del navegador. Si localStorage no está disponible (modo privado), las carpetas
// igual se abren y cierran: el valor queda en memoria mientras dure la pestaña.
const CLAVE_GRUPOS = 'sidebar-grupos-abiertos';
let gruposEnMemoria: string | null = null;
const oyentesGrupos = new Set<() => void>();

function leerGrupos(): string {
  if (gruposEnMemoria !== null) return gruposEnMemoria;
  try {
    return localStorage.getItem(CLAVE_GRUPOS) ?? '[]';
  } catch {
    return '[]';
  }
}

function suscribirGrupos(aviso: () => void): () => void {
  oyentesGrupos.add(aviso);
  return () => {
    oyentesGrupos.delete(aviso);
  };
}

function guardarGrupos(ids: string[]): void {
  gruposEnMemoria = JSON.stringify(ids);
  try {
    localStorage.setItem(CLAVE_GRUPOS, gruposEnMemoria);
  } catch {
    // no se pudo recordar para la próxima vez: queda solo en memoria
  }
  oyentesGrupos.forEach((aviso) => aviso());
}

// El operario y el marinero solo acceden a Tareas desde el admin UI.
const STAFF_TAREAS_ALLOWED = new Set(['/tareas']);
const STAFF_TAREAS_ROLES = new Set(['operario', 'marinero']);

type Props = {
  subtitle: string;
  userName: string;
  userInitial: string;
  rol: string;
  variant?: SidebarVariant;
  pendingSolicitudes?: number;
  pendingAlertas?: number;
};

export function Sidebar({
  subtitle,
  userName,
  userInitial,
  rol,
  variant = 'dashboard',
  pendingSolicitudes,
  pendingAlertas,
}: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // El operario y el marinero solo ven Tareas: se filtran los items y los grupos que quedan
  // con uno solo se muestran sueltos (una carpeta de un solo item no tiene sentido).
  const permitido = ({ href }: SidebarItem) =>
    variant === 'dashboard' && STAFF_TAREAS_ROLES.has(rol) ? STAFF_TAREAS_ALLOWED.has(href) : true;
  const entradas: NavEntry[] = NAV_BY_VARIANT[variant].flatMap((e): NavEntry[] => {
    if (!esGrupo(e)) return permitido(e) ? [e] : [];
    const visibles = e.items.filter(permitido);
    if (visibles.length === 0) return [];
    if (visibles.length === 1) return [visibles[0]];
    return [{ ...e, items: visibles }];
  });
  const items: SidebarItem[] = entradas.flatMap((e) => (esGrupo(e) ? e.items : [e]));

  // Carpetas abiertas: las que el usuario abrió (se recuerdan en este navegador) más la que
  // contiene la pantalla actual, que siempre queda abierta para no perder de vista dónde estás.
  const abiertosCrudo = useSyncExternalStore(suscribirGrupos, leerGrupos, () => '[]');
  const abiertos = useMemo<string[]>(() => {
    try {
      const x = JSON.parse(abiertosCrudo);
      return Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : [];
    } catch {
      return [];
    }
  }, [abiertosCrudo]);
  const alternarGrupo = (id: string) =>
    guardarGrupos(abiertos.includes(id) ? abiertos.filter((x) => x !== id) : [...abiertos, id]);

  // Si este item es prefijo de otro (ej. /super-admin con /super-admin/pricing), solo se
  // activa con match exacto. Si no, matchea también subpaths para que /usuarios/123 deje
  // /usuarios resaltado.
  const estaActivo = (href: string) => {
    const hasChildren = items.some(
      (other) => other.href !== href && other.href.startsWith(href + '/'),
    );
    return hasChildren ? pathname === href : pathname === href || pathname.startsWith(href + '/');
  };

  const badgeDe = (href: string): number =>
    href === '/solicitudes-socio'
      ? (pendingSolicitudes ?? 0)
      : href === '/dashboard'
        ? (pendingAlertas ?? 0)
        : 0;

  const renderItem = ({ href, label, icon: Icon }: SidebarItem) => {
    const active = estaActivo(href);
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
        <span className="flex-1">{label}</span>
        <Badge n={badgeDe(href)} active={active} />
      </Link>
    );
  };

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
          {entradas.map((entrada) => {
            if (!esGrupo(entrada)) return renderItem(entrada);
            const contieneActivo = entrada.items.some((i) => estaActivo(i.href));
            const expandido = contieneActivo || abiertos.includes(entrada.id);
            const GrupoIcon = entrada.icon;
            // Con la carpeta cerrada, los avisos de adentro (ej. solicitudes pendientes) se ven en el título.
            const pendientes = entrada.items.reduce((acc, i) => acc + badgeDe(i.href), 0);
            return (
              <div key={entrada.id}>
                <button
                  type="button"
                  onClick={() => alternarGrupo(entrada.id)}
                  aria-expanded={expandido}
                  className={`flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium transition-colors ${
                    contieneActivo ? 'text-[#175861]' : 'text-[#364153] hover:bg-gray-100'
                  }`}
                >
                  <GrupoIcon className="h-[18px] w-[18px] shrink-0" />
                  <span className="flex-1 text-left">{entrada.label}</span>
                  {!expandido && <Badge n={pendientes} active={false} />}
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${
                      expandido ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {expandido && (
                  <div className="mt-0.5 mb-1 ml-[22px] space-y-0.5 border-l border-gray-200 pl-2">
                    {entrada.items.map((i) => renderItem(i))}
                  </div>
                )}
              </div>
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
