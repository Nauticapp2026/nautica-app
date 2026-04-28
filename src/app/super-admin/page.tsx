import Link from 'next/link';
import { Tag, Users } from 'lucide-react';

const SECTIONS = [
  {
    href: '/super-admin/usuarios',
    icon: Users,
    title: 'Usuarios',
    description: 'Listado de cuentas de la plataforma. Gestionar roles, super admin y eliminar.',
  },
  {
    href: '/super-admin/pricing',
    icon: Tag,
    title: 'Pricing',
    description: 'Editar el rate por plan y las capacidades del slider de la landing.',
  },
];

export default function SuperAdminHomePage() {
  return (
    <div className="space-y-6 p-4 md:p-8">
      <div>
        <h1 className="page-title">Panel de plataforma</h1>
        <p className="page-subtitle mt-1">
          Configuración global de NauticApp. Los cambios afectan a todas las guarderías.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {SECTIONS.map(({ href, icon: Icon, title, description }) => (
          <Link
            key={href}
            href={href}
            className="flex items-start gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:shadow-md"
          >
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: 'rgba(23, 88, 97, 0.10)' }}
            >
              <Icon className="size-5" style={{ color: '#175861' }} />
            </span>
            <div>
              <h2 className="text-base font-bold text-[#175861]">{title}</h2>
              <p className="mt-1 text-sm text-[#677B85]">{description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
