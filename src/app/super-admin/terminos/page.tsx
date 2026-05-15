import { desc } from 'drizzle-orm';

import { requireSuperAdmin } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { terminosVersiones } from '@/lib/db/schema';
import { TerminosClient } from './terminos-client';

export const dynamic = 'force-dynamic';

export default async function SuperAdminTerminosPage() {
  await requireSuperAdmin();

  const versiones = await db
    .select({
      id: terminosVersiones.id,
      version: terminosVersiones.version,
      contenido: terminosVersiones.contenido,
      publicadoEn: terminosVersiones.publicadoEn,
    })
    .from(terminosVersiones)
    .orderBy(desc(terminosVersiones.version));

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div>
        <h1 className="page-title">Términos y Condiciones</h1>
        <p className="page-subtitle mt-1">
          Histórico de versiones publicadas. La vigente es la de número más alto. Al publicar una
          nueva, todos los usuarios van a tener que volver a aceptarla en su próximo ingreso.
        </p>
      </div>

      <TerminosClient
        versiones={versiones.map((v) => ({
          id: v.id,
          version: v.version,
          contenido: v.contenido,
          publicadoEn: v.publicadoEn.toISOString(),
        }))}
      />
    </div>
  );
}
