import Link from 'next/link';

export default function SuperAdminHomePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#175861]">Panel de plataforma</h1>
        <p className="mt-1 text-sm text-[#677B85]">
          Configuración global de NauticApp. Los cambios afectan a todas las guarderías.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Link
          href="/super-admin/pricing"
          className="block rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:shadow-md"
        >
          <h2 className="text-lg font-bold text-[#175861]">Pricing</h2>
          <p className="mt-1 text-sm text-[#677B85]">
            Editar el rate por plan y las capacidades del slider de la landing.
          </p>
        </Link>
      </div>
    </div>
  );
}
