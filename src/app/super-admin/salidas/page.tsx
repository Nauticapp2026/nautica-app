import { and, desc, eq, inArray } from 'drizzle-orm';

import { requireSuperAdmin } from '@/lib/auth/session';
import { db } from '@/lib/db';
import {
  embarcaciones,
  guarderias,
  invitados,
  memberships,
  porteria,
  porteriaInvitados,
  profiles,
} from '@/lib/db/schema';

import { SalidasClient, type SalidaRow } from './salidas-client';

export const dynamic = 'force-dynamic';

// Tope de filas que se traen a la pantalla. El Excel se genera aparte (ver
// api/super-admin/salidas/export) y no tiene este tope: es el reporte completo.
const LIMITE_PANTALLA = 1000;

export default async function SuperAdminSalidasPage() {
  await requireSuperAdmin();

  // Todas las salidas de todos los clubes (cross-tenant a propósito: esta
  // sección reemplaza el libro de papel de Prefectura).
  const filas = await db
    .select({
      id: porteria.id,
      guarderiaNombre: guarderias.nombre,
      desde: porteria.desde,
      hasta: porteria.hasta,
      arribadaEn: porteria.arribadaEn,
      socioIngresoEn: porteria.socioIngresoEn,
      estado: porteria.estado,
      createdAt: porteria.createdAt,
      socioNombre: profiles.nombre,
      socioApellido: profiles.apellido,
      socioTelefono: profiles.telefono,
      numeroSocio: memberships.numeroSocio,
      embarcacionNombre: embarcaciones.nombre,
      embarcacionMatricula: embarcaciones.matricula,
    })
    .from(porteria)
    .innerJoin(guarderias, eq(guarderias.id, porteria.guarderiaId))
    .leftJoin(profiles, eq(profiles.id, porteria.socioId))
    .leftJoin(embarcaciones, eq(embarcaciones.id, porteria.embarcacionId))
    // La membresía da el Nº de socio EN ESE club (no es un dato global).
    .leftJoin(
      memberships,
      and(
        eq(memberships.userId, porteria.socioId),
        eq(memberships.guarderiaId, porteria.guarderiaId),
      ),
    )
    .where(eq(porteria.tipo, 'salida'))
    .orderBy(desc(porteria.createdAt))
    .limit(LIMITE_PANTALLA);

  // Acompañantes a bordo, en una sola query (evita N+1 por fila).
  const porteriaIds = filas.map((f) => f.id);
  const acompRows =
    porteriaIds.length > 0
      ? await db
          .select({
            porteriaId: porteriaInvitados.porteriaId,
            nombre: invitados.nombre,
            apellido: invitados.apellido,
            cantidadAcompanantes: porteriaInvitados.cantidadAcompanantes,
          })
          .from(porteriaInvitados)
          .innerJoin(invitados, eq(invitados.id, porteriaInvitados.invitadoId))
          .where(inArray(porteriaInvitados.porteriaId, porteriaIds))
      : [];

  const acompPorSalida = new Map<string, string[]>();
  for (const a of acompRows) {
    const nombre = [a.nombre, a.apellido].filter(Boolean).join(' ').trim();
    if (!nombre) continue;
    // Un invitado puede venir con gente sin nombrar ("Pedro + 5"): Prefectura
    // necesita saber cuánta gente subió, no solo quién estaba anotado.
    const extra = a.cantidadAcompanantes ?? 0;
    const arr = acompPorSalida.get(a.porteriaId) ?? [];
    arr.push(extra > 0 ? `${nombre} + ${extra}` : nombre);
    acompPorSalida.set(a.porteriaId, arr);
  }

  const salidas: SalidaRow[] = filas.map((f) => ({
    id: f.id,
    club: f.guarderiaNombre,
    socio: [f.socioNombre, f.socioApellido].filter(Boolean).join(' ').trim() || '—',
    numeroSocio: f.numeroSocio,
    telefono: f.socioTelefono,
    embarcacion: f.embarcacionNombre,
    matricula: f.embarcacionMatricula,
    // `desde`/`hasta` son horas naive (los dígitos que tipeó el socio); el
    // resto son timestamptz reales. Se formatean distinto en el cliente.
    desde: f.desde ? f.desde.toISOString() : null,
    hasta: f.hasta ? f.hasta.toISOString() : null,
    ingresoEn: f.socioIngresoEn ? f.socioIngresoEn.toISOString() : null,
    arribadaEn: f.arribadaEn ? f.arribadaEn.toISOString() : null,
    estado: f.estado,
    acompanantes: acompPorSalida.get(f.id) ?? [],
  }));

  const clubes = [...new Set(salidas.map((s) => s.club))].sort((a, b) => a.localeCompare(b, 'es'));

  // Mismo envoltorio que el resto de /super-admin (el layout no aporta padding).
  return (
    <div className="space-y-6 p-4 md:p-8">
      <div>
        <h1 className="page-title">Salidas</h1>
        <p className="page-subtitle mt-1">
          Todas las salidas registradas en los clubes de la plataforma.
        </p>
      </div>
      <SalidasClient salidas={salidas} clubes={clubes} truncado={filas.length >= LIMITE_PANTALLA} />
    </div>
  );
}
