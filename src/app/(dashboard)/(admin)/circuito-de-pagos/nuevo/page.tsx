import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { ADMIN_ROLES } from '@/config/roles';
import { getActiveMarina } from '@/lib/auth/session';
import { proveedoresParaSelector } from '@/lib/cuentas-a-pagar/consultas';
import { todayArg } from '@/lib/dates';

import { NuevoPagoClient } from './nuevo-pago-client';

export default async function NuevoPagoPage() {
  const ctx = await getActiveMarina();
  if (!ctx) return null;
  if (!ctx.profile.isSuperAdmin && !ADMIN_ROLES.includes(ctx.activeMembership.rol)) {
    redirect('/dashboard');
  }
  const proveedores = await proveedoresParaSelector(ctx.activeMembership.guarderiaId, true);

  return (
    <div className="p-4 md:p-8">
      <Link
        href="/circuito-de-pagos"
        className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Circuito de pagos
      </Link>
      <div className="mb-6">
        <h1 className="page-title">Nuevo pago</h1>
        <p className="page-subtitle mt-1">
          Solo se pueden pagar comprobantes en estado A (autorizados). Genera una orden de pago.
        </p>
      </div>
      <NuevoPagoClient proveedores={proveedores} hoy={todayArg()} />
    </div>
  );
}
