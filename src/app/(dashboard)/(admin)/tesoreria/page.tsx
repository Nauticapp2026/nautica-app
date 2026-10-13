import { eq } from 'drizzle-orm';

import { getActiveMarina } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { guarderias } from '@/lib/db/schema';
import { createAdminClient } from '@/lib/supabase/admin';
import { todayArg } from '@/lib/dates';
import { INSTRUMENTOS, INSTRUMENTO_VALUES, type Instrumento } from '@/lib/tesoreria/instrumentos';
import { calcularTesoreria, cargarLineasTesoreria } from '@/lib/tesoreria/movimientos';
import { PERIODO_CARGA_DEFAULT, esPeriodoCarga } from '@/lib/tesoreria/periodo-carga';
import { PERIODO_EDICION_DEFAULT, esPeriodoEdicion } from '@/lib/tesoreria/periodo-edicion';

import { TesoreriaClient, type LineaTesoreriaUI } from './tesoreria-client';

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const TODOS = INSTRUMENTOS.map((i) => i.value as Instrumento);

/**
 * Tesorería: dos bloques independientes sobre el mismo libro de caja
 * (pedido del cliente 2026-10-13).
 *
 *  - Cierre de caja (params `desde`, `hasta`, `inst`): Desde y Hasta son
 *    obligatorias y arrancan en el día de hoy; saldos por instrumento y PDF.
 *  - Registro de Movimientos (params `rdesde`, `rhasta`, `rinst`): arranca
 *    mostrando TODO el historial; fechas e instrumento son opcionales.
 *
 * Todo viaja por la URL para que refrescar o compartir el link mantenga la
 * vista, y para que el server calcule los saldos con el rango exacto.
 */
export default async function TesoreriaPage({
  searchParams,
}: {
  searchParams: Promise<{
    desde?: string;
    hasta?: string;
    inst?: string;
    rdesde?: string;
    rhasta?: string;
    rinst?: string;
  }>;
}) {
  const sp = await searchParams;
  const ctx = await getActiveMarina();
  if (!ctx) return null;
  const gId = ctx.activeMembership.guarderiaId;

  const hoy = todayArg();

  // ── Cierre de caja: fechas obligatorias, instrumentos todos por defecto ──
  const desde = sp.desde && YMD.test(sp.desde) ? sp.desde : hoy;
  const hastaCrudo = sp.hasta && YMD.test(sp.hasta) ? sp.hasta : hoy;
  const hasta = hastaCrudo < desde ? desde : hastaCrudo;
  const instElegidos = (sp.inst ?? '')
    .split(',')
    .filter((v) => INSTRUMENTO_VALUES.includes(v)) as Instrumento[];
  const instrumentos = instElegidos.length > 0 ? instElegidos : TODOS;

  // ── Registro de movimientos: todo por defecto, un instrumento o todos ────
  const rdesde = sp.rdesde && YMD.test(sp.rdesde) ? sp.rdesde : null;
  const rhastaCrudo = sp.rhasta && YMD.test(sp.rhasta) ? sp.rhasta : null;
  const rhasta = rhastaCrudo && rdesde && rhastaCrudo < rdesde ? rdesde : rhastaCrudo;
  const rinst =
    sp.rinst && INSTRUMENTO_VALUES.includes(sp.rinst) ? (sp.rinst as Instrumento) : null;

  const [todas, [club]] = await Promise.all([
    cargarLineasTesoreria(gId),
    db
      .select({
        nombre: guarderias.nombre,
        razonSocial: guarderias.razonSocial,
        cuit: guarderias.cuit,
        direccion: guarderias.direccion,
        ciudad: guarderias.ciudad,
        periodoCargaTesoreria: guarderias.periodoCargaTesoreria,
        periodoEdicionTesoreria: guarderias.periodoEdicionTesoreria,
      })
      .from(guarderias)
      .where(eq(guarderias.id, gId))
      .limit(1),
  ]);

  const cierre = calcularTesoreria(todas, { desde, hasta, instrumentos });
  const registro = calcularTesoreria(todas, {
    desde: rdesde,
    hasta: rhasta,
    instrumentos: rinst ? [rinst] : TODOS,
  });

  // Adjuntos (solo se listan en el registro): el bucket es privado, se firman
  // por una hora en un solo viaje.
  const paths = registro.lineas.map((l) => l.adjuntoPath).filter((p): p is string => !!p);
  const urls = new Map<string, string>();
  if (paths.length > 0) {
    const admin = createAdminClient();
    const { data } = await admin.storage.from('documentos').createSignedUrls(paths, 60 * 60);
    for (const d of data ?? []) {
      if (d.path && d.signedUrl) urls.set(d.path, d.signedUrl);
    }
  }
  const lineasRegistro: LineaTesoreriaUI[] = registro.lineas.map((l) => ({
    ...l,
    adjuntoUrl: l.adjuntoPath ? (urls.get(l.adjuntoPath) ?? null) : null,
  }));

  return (
    <TesoreriaClient
      lineas={cierre.lineas}
      resumen={cierre.resumen}
      consolidado={cierre.consolidado}
      filtros={{ desde, hasta, instrumentos }}
      registro={{
        lineas: lineasRegistro,
        filtros: { desde: rdesde, hasta: rhasta, instrumento: rinst },
      }}
      hoy={hoy}
      periodoCarga={
        esPeriodoCarga(club?.periodoCargaTesoreria)
          ? club.periodoCargaTesoreria
          : PERIODO_CARGA_DEFAULT
      }
      periodoEdicion={
        esPeriodoEdicion(club?.periodoEdicionTesoreria)
          ? club.periodoEdicionTesoreria
          : PERIODO_EDICION_DEFAULT
      }
      club={{
        nombre: club?.razonSocial?.trim() || club?.nombre || 'Club',
        cuit: club?.cuit ?? null,
        direccion: club?.direccion ?? null,
        ciudad: club?.ciudad ?? null,
      }}
    />
  );
}
