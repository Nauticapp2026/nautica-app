import { eq } from 'drizzle-orm';

import { getActiveMarina } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { guarderias } from '@/lib/db/schema';
import { createAdminClient } from '@/lib/supabase/admin';
import { todayArg } from '@/lib/dates';
import { INSTRUMENTOS, INSTRUMENTO_VALUES, type Instrumento } from '@/lib/tesoreria/instrumentos';
import { listarTesoreria } from '@/lib/tesoreria/movimientos';

import { TesoreriaClient, type LineaTesoreriaUI } from './tesoreria-client';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Tesorería: libro de caja del club por instrumento.
 *
 * Los filtros viajan por la URL (desde, hasta, inst) para que refrescar o
 * compartir el link mantenga la vista y para que el server calcule los saldos
 * con el rango exacto. Sin `desde` en la URL se arranca en el día de hoy
 * (pedido del cliente: "desde el inicio del día actual"); `desde=` vacío
 * significa "desde el primer movimiento".
 */
export default async function TesoreriaPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; inst?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await getActiveMarina();
  if (!ctx) return null;
  const gId = ctx.activeMembership.guarderiaId;

  const hoy = todayArg();
  const desde = sp.desde === undefined ? hoy : YMD.test(sp.desde) ? sp.desde : null;
  const hasta = sp.hasta && YMD.test(sp.hasta) ? sp.hasta : null;
  const instElegidos = (sp.inst ?? '')
    .split(',')
    .filter((v) => INSTRUMENTO_VALUES.includes(v)) as Instrumento[];
  const instrumentos =
    instElegidos.length > 0 ? instElegidos : INSTRUMENTOS.map((i) => i.value as Instrumento);

  const [resultado, [club]] = await Promise.all([
    listarTesoreria(gId, { desde, hasta, instrumentos }),
    db
      .select({
        nombre: guarderias.nombre,
        razonSocial: guarderias.razonSocial,
        cuit: guarderias.cuit,
        direccion: guarderias.direccion,
      })
      .from(guarderias)
      .where(eq(guarderias.id, gId))
      .limit(1),
  ]);

  // Adjuntos: el bucket es privado, se firman por una hora en un solo viaje.
  const paths = resultado.lineas.map((l) => l.adjuntoPath).filter((p): p is string => !!p);
  const urls = new Map<string, string>();
  if (paths.length > 0) {
    const admin = createAdminClient();
    const { data } = await admin.storage.from('documentos').createSignedUrls(paths, 60 * 60);
    for (const d of data ?? []) {
      if (d.path && d.signedUrl) urls.set(d.path, d.signedUrl);
    }
  }
  const lineas: LineaTesoreriaUI[] = resultado.lineas.map((l) => ({
    ...l,
    adjuntoUrl: l.adjuntoPath ? (urls.get(l.adjuntoPath) ?? null) : null,
  }));

  return (
    <TesoreriaClient
      lineas={lineas}
      resumen={resultado.resumen}
      consolidado={resultado.consolidado}
      rubros={resultado.rubros}
      subrubros={resultado.subrubros}
      filtros={{ desde, hasta, instrumentos }}
      hoy={hoy}
      club={{
        nombre: club?.razonSocial?.trim() || club?.nombre || 'Club',
        cuit: club?.cuit ?? null,
        direccion: club?.direccion ?? null,
      }}
    />
  );
}
