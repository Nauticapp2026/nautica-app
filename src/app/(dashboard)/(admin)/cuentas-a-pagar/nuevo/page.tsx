import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { ADMIN_ROLES } from '@/config/roles';
import { getActiveMarina } from '@/lib/auth/session';
import { catalogosBaseDelClub } from '@/lib/catalogos-club-server';
import { proveedoresParaSelector } from '@/lib/cuentas-a-pagar/consultas';
import { todayArg } from '@/lib/dates';

import { ComprobanteForm } from '../comprobante-form';

export default async function NuevoComprobantePage() {
  const ctx = await getActiveMarina();
  if (!ctx) return null;
  if (!ctx.profile.isSuperAdmin && !ADMIN_ROLES.includes(ctx.activeMembership.rol)) {
    redirect('/dashboard');
  }
  const gId = ctx.activeMembership.guarderiaId;

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
      <div className="mb-6">
        <h1 className="page-title">Nuevo comprobante</h1>
        <p className="page-subtitle mt-1">
          Se carga en estado H (ingresado). Para pagarlo tiene que pasar a A (autorizado).
        </p>
      </div>
      <ComprobanteForm
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
