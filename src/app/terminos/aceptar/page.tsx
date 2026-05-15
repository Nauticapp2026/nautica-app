import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth/session';
import { getVersionVigente, yaAceptoVersionVigente } from '@/lib/auth/terminos';

import { AceptarTerminosClient } from './aceptar-client';

export const dynamic = 'force-dynamic';

export default async function AceptarTerminosPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  // Si ya aceptó la vigente, no hay nada que mostrar — al dashboard.
  if (await yaAceptoVersionVigente(user.id)) redirect('/dashboard');

  const vigente = await getVersionVigente();
  if (!vigente) redirect('/dashboard');

  const { next } = await searchParams;

  return (
    <AceptarTerminosClient
      version={vigente.version}
      contenido={vigente.contenido}
      publicadoEn={vigente.publicadoEn.toISOString()}
      next={next ?? '/dashboard'}
    />
  );
}
