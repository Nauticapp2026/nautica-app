import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { ADMIN_ROLES } from '@/config/roles';
import { getActiveMarina } from '@/lib/auth/session';
import { catalogosBaseDelClub } from '@/lib/catalogos-club-server';
import { obtenerComprobante, proveedoresParaSelector } from '@/lib/cuentas-a-pagar/consultas';
import { todayArg } from '@/lib/dates';

import { ComprobanteDetail } from './comprobante-detail';

export default async function ComprobantePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getActiveMarina();
  if (!ctx) return null;
  if (!ctx.profile.isSuperAdmin && !ADMIN_ROLES.includes(ctx.activeMembership.rol)) {
    redirect('/dashboard');
  }
  const gId = ctx.activeMembership.guarderiaId;

  // Se busca SIEMPRE con el guarderia_id del usuario: un id de otro club da 404.
  const det = await obtenerComprobante(gId, id);
  if (!det) notFound();

  const [proveedores, catalogos] = await Promise.all([
    proveedoresParaSelector(gId),
    catalogosBaseDelClub(gId),
  ]);

  return (
    <div className="p-4 md:p-8">
      <Link
        href="/cuentas-a-pagar"
        className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Cuentas a pagar
      </Link>
      <ComprobanteDetail
        det={det}
        proveedores={proveedores}
        catalogos={{
          condicionesPago: catalogos.prov_condicion_pago,
          formasPago: catalogos.prov_forma_pago,
          cuentasContables: catalogos.prov_cuenta_contable,
        }}
        hoy={todayArg()}
      />
    </div>
  );
}
