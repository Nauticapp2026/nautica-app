import Link from 'next/link';
import { Tag } from 'lucide-react';

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
        <Link
          href="/super-admin/pricing"
          className="flex items-start gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:shadow-md"
        >
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: 'rgba(23, 88, 97, 0.10)' }}
          >
            <Tag className="size-5" style={{ color: '#175861' }} />
          </span>
          <div>
            <h2 className="text-base font-bold text-[#175861]">Pricing</h2>
            <p className="mt-1 text-sm text-[#677B85]">
              Editar el rate por plan y las capacidades del slider de la landing.
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}
