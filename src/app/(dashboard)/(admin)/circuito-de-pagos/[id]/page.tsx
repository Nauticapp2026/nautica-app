import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { eq } from 'drizzle-orm';

import { ADMIN_ROLES } from '@/config/roles';
import { getActiveMarina } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { guarderias } from '@/lib/db/schema';
import { obtenerPago } from '@/lib/pagos/consultas';

import { PagoDetail } from './pago-detail';

export default async function PagoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getActiveMarina();
  if (!ctx) return null;
  if (!ctx.profile.isSuperAdmin && !ADMIN_ROLES.includes(ctx.activeMembership.rol)) {
    redirect('/dashboard');
  }
  const gId = ctx.activeMembership.guarderiaId;

  // Se busca SIEMPRE con el guarderia_id del usuario: un id de otro club da 404.
  const pago = await obtenerPago(gId, id);
  if (!pago) notFound();

  const [club] = await db
    .select({
      nombre: guarderias.nombre,
      razonSocial: guarderias.razonSocial,
      cuit: guarderias.cuit,
      direccion: guarderias.direccion,
    })
    .from(guarderias)
    .where(eq(guarderias.id, gId))
    .limit(1);

  return (
    <div className="p-4 md:p-8">
      <Link
        href="/circuito-de-pagos"
        className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Circuito de pagos
      </Link>
      <PagoDetail
        pago={pago}
        club={{
          nombre: club?.razonSocial?.trim() || club?.nombre || 'Club',
          cuit: club?.cuit ?? null,
          direccion: club?.direccion ?? null,
        }}
      />
    </div>
  );
}
