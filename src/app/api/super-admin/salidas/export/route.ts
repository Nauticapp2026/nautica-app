import ExcelJS from 'exceljs';
import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import { NextResponse } from 'next/server';

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
import { normalizarBusqueda } from '@/lib/buscador';
import { formatArgentinaDateTime, formatNaiveDateTime } from '@/lib/dates';

/**
 * Reporte de salidas en Excel para Prefectura (reemplaza el libro de papel).
 *
 * Es un route handler y no un server action porque la respuesta es un archivo
 * para descargar — mismo criterio que /api/facturas/pdf. Es una LECTURA, no una
 * mutación, así que no rompe la regla de "mutaciones por server action".
 *
 * Respeta los mismos filtros que la pantalla (llegan por query string) pero sin
 * el tope de filas de la tabla: acá se busca el registro completo.
 */
export async function GET(req: Request) {
  await requireSuperAdmin();

  const url = new URL(req.url);
  const q = normalizarBusqueda((url.searchParams.get('q') ?? '').trim());
  const club = url.searchParams.get('club') ?? '';
  const estadoFiltro = url.searchParams.get('estado') ?? '';
  const desdeFiltro = url.searchParams.get('desde') ?? '';
  const hastaFiltro = url.searchParams.get('hasta') ?? '';

  const condiciones = [eq(porteria.tipo, 'salida')];
  if (club) condiciones.push(eq(guarderias.nombre, club));
  // `desde` es naive: el ISO guardado empieza con YYYY-MM-DD, así que comparar
  // contra el borde del día en UTC filtra por fecha calendaria sin corrimiento.
  if (desdeFiltro) condiciones.push(gte(porteria.desde, new Date(`${desdeFiltro}T00:00:00Z`)));
  if (hastaFiltro) condiciones.push(lte(porteria.desde, new Date(`${hastaFiltro}T23:59:59Z`)));

  const filas = await db
    .select({
      id: porteria.id,
      guarderiaNombre: guarderias.nombre,
      desde: porteria.desde,
      hasta: porteria.hasta,
      arribadaEn: porteria.arribadaEn,
      socioIngresoEn: porteria.socioIngresoEn,
      estado: porteria.estado,
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
    .leftJoin(
      memberships,
      and(
        eq(memberships.userId, porteria.socioId),
        eq(memberships.guarderiaId, porteria.guarderiaId),
      ),
    )
    .where(and(...condiciones))
    .orderBy(desc(porteria.desde));

  const porteriaIds = filas.map((f) => f.id);
  const acompRows =
    porteriaIds.length > 0
      ? await db
          .select({
            porteriaId: porteriaInvitados.porteriaId,
            nombre: invitados.nombre,
            apellido: invitados.apellido,
          })
          .from(porteriaInvitados)
          .innerJoin(invitados, eq(invitados.id, porteriaInvitados.invitadoId))
          .where(inArray(porteriaInvitados.porteriaId, porteriaIds))
      : [];
  const acompPorSalida = new Map<string, string[]>();
  for (const a of acompRows) {
    const nombre = [a.nombre, a.apellido].filter(Boolean).join(' ').trim();
    if (!nombre) continue;
    const arr = acompPorSalida.get(a.porteriaId) ?? [];
    arr.push(nombre);
    acompPorSalida.set(a.porteriaId, arr);
  }

  function estadoLabel(f: (typeof filas)[number]): string {
    if (f.estado === 'revocado') return 'Cancelada';
    if (f.arribadaEn) return 'Arribó';
    if (f.socioIngresoEn) return 'Navegando';
    return 'Programada';
  }
  function claveEstado(f: (typeof filas)[number]): string {
    if (f.estado === 'revocado') return 'cancelada';
    if (f.arribadaEn) return 'arribo';
    if (f.socioIngresoEn) return 'navegando';
    return 'programada';
  }

  // Búsqueda de texto y estado: se resuelven acá para que el Excel coincida
  // exactamente con lo que el usuario ve filtrado en pantalla.
  const finales = filas.filter((f) => {
    if (estadoFiltro && claveEstado(f) !== estadoFiltro) return false;
    if (!q) return true;
    const socio = [f.socioNombre, f.socioApellido].filter(Boolean).join(' ');
    return normalizarBusqueda(
      [
        socio,
        f.embarcacionNombre ?? '',
        f.embarcacionMatricula ?? '',
        f.numeroSocio != null ? `#${f.numeroSocio}` : '',
        (acompPorSalida.get(f.id) ?? []).join(' '),
      ].join(' '),
    ).includes(q);
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'NauticApp';
  wb.created = new Date();
  const ws = wb.addWorksheet('Salidas');

  const columnas: { header: string; width: number }[] = [
    { header: 'Club', width: 26 },
    { header: 'Nº socio', width: 10 },
    { header: 'Socio', width: 26 },
    { header: 'Teléfono', width: 18 },
    { header: 'Embarcación', width: 22 },
    { header: 'Matrícula', width: 14 },
    { header: 'Salida', width: 18 },
    { header: 'Regreso previsto', width: 18 },
    { header: 'Ingreso al club', width: 18 },
    { header: 'Arribo confirmado', width: 18 },
    { header: 'Estado', width: 14 },
    { header: 'A bordo', width: 40 },
  ];
  ws.columns = columnas.map((c) => ({ header: c.header, width: c.width }));

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF175861' } };
  header.alignment = { vertical: 'middle' };
  header.height = 20;

  for (const f of finales) {
    ws.addRow([
      f.guarderiaNombre,
      f.numeroSocio ?? '',
      [f.socioNombre, f.socioApellido].filter(Boolean).join(' ').trim() || '—',
      f.socioTelefono ?? '',
      f.embarcacionNombre ?? '',
      f.embarcacionMatricula ?? '',
      // Naive → se escriben como texto con los dígitos cargados, para que no
      // haya corrimiento de zona horaria al abrir el archivo.
      f.desde ? formatNaiveDateTime(f.desde) : '',
      f.hasta ? formatNaiveDateTime(f.hasta) : '',
      // timestamptz real → hora Argentina.
      f.socioIngresoEn ? formatArgentinaDateTime(f.socioIngresoEn) : '',
      f.arribadaEn ? formatArgentinaDateTime(f.arribadaEn) : '',
      estadoLabel(f),
      (acompPorSalida.get(f.id) ?? []).join(', '),
    ]);
  }

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const buffer = await wb.xlsx.writeBuffer();
  const hoy = new Date().toISOString().slice(0, 10);

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="salidas-${hoy}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
