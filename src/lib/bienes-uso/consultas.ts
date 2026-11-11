/**
 * Consultas de Bienes de uso (solo servidor). Todas reciben el `guarderia_id` del admin actual
 * y filtran por él; los datos salen serializables (fechas como texto, importes como número).
 */

import { and, asc, desc, eq } from 'drizzle-orm';

import { firmarArchivos } from '@/lib/archivos-privados';
import { unirOpciones, type CatalogosDisponibles } from '@/lib/catalogos-club';
import { catalogosBaseDelClub } from '@/lib/catalogos-club-server';
import { db } from '@/lib/db';
import {
  areas,
  bienUsoEmpleados,
  bienUsoFallas,
  bienUsoHorarios,
  bienUsoInspecciones,
  bienUsoInsumos,
  bienUsoIntervenciones,
  bienUsoPlanes,
  bienesUso,
  empleados,
  proveedores,
} from '@/lib/db/schema';

const nombreCompleto = (n: string | null, a: string | null) => [a, n].filter(Boolean).join(', ');
const num = (v: string | null) => (v === null ? null : Number(v));

const DIA_CORTO = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/** "Lun a Vie 08:00–17:00 · Sáb 08:00–12:00": agrupa los días con la misma franja. */
export function resumenHorario(
  horarios: { dia: number; desde: string; hasta: string }[],
  noAplica: boolean,
): string {
  if (noAplica) return 'No aplica';
  if (horarios.length === 0) return '';
  const porFranja = new Map<string, number[]>();
  for (const h of horarios) {
    const k = `${h.desde.slice(0, 5)}–${h.hasta.slice(0, 5)}`;
    porFranja.set(k, [...(porFranja.get(k) ?? []), h.dia]);
  }
  return [...porFranja.entries()]
    .map(([franja, dias]) => {
      const ord = [...new Set(dias)].sort((a, b) => a - b);
      // Rachas de días consecutivos: "Lun a Vie".
      const rachas: number[][] = [];
      for (const d of ord) {
        const ult = rachas[rachas.length - 1];
        if (ult && ult[ult.length - 1] === d - 1) ult.push(d);
        else rachas.push([d]);
      }
      const txt = rachas
        .map((r) =>
          r.length >= 3
            ? `${DIA_CORTO[r[0] - 1]} a ${DIA_CORTO[r[r.length - 1] - 1]}`
            : r.map((d) => DIA_CORTO[d - 1]).join(', '),
        )
        .join(', ');
      return `${txt} ${franja}`;
    })
    .join(' · ');
}

// ─── Lista (pantalla de consulta) ───────────────────────────────────────────

export type FilaBien = {
  id: string;
  numero: number;
  fechaIncorporacion: string;
  estado: string;
  estadoDetalle: string | null;
  vidaUtilAnios: number | null;
  fechaBaja: string | null;
  motivoBaja: string | null;
  motivoBajaDetalle: string | null;
  formaAdquisicion: string | null;
  tipoBien: string | null;
  rubro: string | null;
  subrubro: string | null;
  nroGuarderia: string | null;
  nombre: string;
  marca: string | null;
  nroSerie: string | null;
  anioFabricacion: number | null;
  patente: string | null;
  ubicaciones: string[];
  lugaresUtilizacion: string[];
  horario: string;
  empleadosAutorizados: string[];
  seguroAseguradora: string | null;
  seguroPoliza: string | null;
  seguroDetalle: string | null;
  seguroVencimiento: string | null;
};

export async function listarBienes(gId: string): Promise<FilaBien[]> {
  const [bienes, horarios, autorizados] = await Promise.all([
    db
      .select()
      .from(bienesUso)
      .where(eq(bienesUso.guarderiaId, gId))
      .orderBy(desc(bienesUso.numero)),
    db
      .select({
        bienId: bienUsoHorarios.bienId,
        dia: bienUsoHorarios.dia,
        desde: bienUsoHorarios.desde,
        hasta: bienUsoHorarios.hasta,
      })
      .from(bienUsoHorarios)
      .where(eq(bienUsoHorarios.guarderiaId, gId)),
    db
      .select({
        bienId: bienUsoEmpleados.bienId,
        nombre: empleados.nombre,
        apellido: empleados.apellido,
      })
      .from(bienUsoEmpleados)
      .innerJoin(empleados, eq(empleados.id, bienUsoEmpleados.empleadoId))
      .where(and(eq(bienUsoEmpleados.guarderiaId, gId), eq(bienUsoEmpleados.rol, 'autorizado'))),
  ]);

  return bienes.map((b) => ({
    id: b.id,
    numero: b.numero,
    fechaIncorporacion: b.fechaIncorporacion,
    estado: b.estado,
    estadoDetalle: b.estadoDetalle,
    vidaUtilAnios: b.vidaUtilAnios,
    fechaBaja: b.fechaBaja,
    motivoBaja: b.motivoBaja,
    motivoBajaDetalle: b.motivoBajaDetalle,
    formaAdquisicion: b.formaAdquisicion,
    tipoBien: b.tipoBien,
    rubro: b.rubro,
    subrubro: b.subrubro,
    nroGuarderia: b.nroGuarderia,
    nombre: b.nombre,
    marca: b.marca,
    nroSerie: b.nroSerie,
    anioFabricacion: b.anioFabricacion,
    patente: b.patente,
    ubicaciones: b.ubicaciones,
    lugaresUtilizacion: b.lugaresUtilizacion,
    horario: resumenHorario(
      horarios.filter((h) => h.bienId === b.id),
      b.horarioNoAplica,
    ),
    empleadosAutorizados: autorizados
      .filter((a) => a.bienId === b.id)
      .map((a) => nombreCompleto(a.nombre, a.apellido)),
    seguroAseguradora: b.seguroAseguradora,
    seguroPoliza: b.seguroPoliza,
    seguroDetalle: b.seguroDetalle,
    seguroVencimiento: b.seguroVencimiento,
  }));
}

// ─── Un bien completo ───────────────────────────────────────────────────────

export type BienDetalle = {
  bien: {
    id: string;
    numero: number;
    fechaIncorporacion: string;
    estado: string;
    estadoDetalle: string | null;
    formaAdquisicion: string | null;
    tipoBien: string | null;
    rubro: string | null;
    subrubro: string | null;
    nroGuarderia: string | null;
    nombre: string;
    marca: string | null;
    nroSerie: string | null;
    anioFabricacion: number | null;
    patente: string | null;
    ubicaciones: string[];
    lugaresUtilizacion: string[];
    horarioNoAplica: boolean;
    seguroAseguradora: string | null;
    seguroPoliza: string | null;
    seguroVencimiento: string | null;
    seguroDetalle: string | null;
    seguroArchivoNombre: string | null;
    seguroUrl: string | null;
    fechaBaja: string | null;
    motivoBaja: string | null;
    motivoBajaDetalle: string | null;
    vidaUtilAnios: number | null;
    valorOrigen: number | null;
    moneda: string;
    fechaInicioAmortizacion: string | null;
    valorResidual: number;
    mantenimientoEmails: string[];
    notas: string | null;
  };
  horarios: { dia: number; desde: string; hasta: string }[];
  autorizados: string[];
  responsables: string[];
  planes: {
    id: string;
    descripcion: string;
    frecuenciaTipo: string;
    frecuenciaValor: number;
    proximaFecha: string | null;
    ultimaFecha: string | null;
    activo: boolean;
    notas: string | null;
  }[];
  intervenciones: {
    id: string;
    fecha: string;
    tipo: string | null;
    descripcion: string | null;
    repuestos: string | null;
    proveedorId: string | null;
    proveedorNombre: string | null;
    costo: number | null;
    moneda: string;
    planId: string | null;
    archivoNombre: string | null;
    url: string | null;
  }[];
  fallas: {
    id: string;
    fecha: string;
    tipo: string | null;
    descripcion: string | null;
    accionCorrectiva: string | null;
    fechaResolucion: string | null;
  }[];
  insumos: {
    id: string;
    tipo: string;
    descripcion: string | null;
    ultimoCambio: string | null;
    frecuenciaValor: number | null;
    frecuenciaTipo: string | null;
    notas: string | null;
  }[];
  inspecciones: {
    id: string;
    fecha: string;
    tipo: string | null;
    resultado: string;
    inspector: string | null;
    observaciones: string | null;
    archivoNombre: string | null;
    url: string | null;
  }[];
};

export async function obtenerBien(gId: string, id: string): Promise<BienDetalle | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [b] = await db
    .select()
    .from(bienesUso)
    .where(and(eq(bienesUso.id, id), eq(bienesUso.guarderiaId, gId)))
    .limit(1);
  if (!b) return null;

  const [horarios, vinculados, planes, intervenciones, fallas, insumos, inspecciones] =
    await Promise.all([
      db
        .select()
        .from(bienUsoHorarios)
        .where(and(eq(bienUsoHorarios.bienId, id), eq(bienUsoHorarios.guarderiaId, gId)))
        .orderBy(asc(bienUsoHorarios.dia), asc(bienUsoHorarios.desde)),
      db
        .select()
        .from(bienUsoEmpleados)
        .where(and(eq(bienUsoEmpleados.bienId, id), eq(bienUsoEmpleados.guarderiaId, gId))),
      db
        .select()
        .from(bienUsoPlanes)
        .where(and(eq(bienUsoPlanes.bienId, id), eq(bienUsoPlanes.guarderiaId, gId)))
        .orderBy(asc(bienUsoPlanes.proximaFecha)),
      db
        .select({ i: bienUsoIntervenciones, proveedor: proveedores.nombre })
        .from(bienUsoIntervenciones)
        .leftJoin(proveedores, eq(proveedores.id, bienUsoIntervenciones.proveedorId))
        .where(
          and(eq(bienUsoIntervenciones.bienId, id), eq(bienUsoIntervenciones.guarderiaId, gId)),
        )
        .orderBy(desc(bienUsoIntervenciones.fecha)),
      db
        .select()
        .from(bienUsoFallas)
        .where(and(eq(bienUsoFallas.bienId, id), eq(bienUsoFallas.guarderiaId, gId)))
        .orderBy(desc(bienUsoFallas.fecha)),
      db
        .select()
        .from(bienUsoInsumos)
        .where(and(eq(bienUsoInsumos.bienId, id), eq(bienUsoInsumos.guarderiaId, gId)))
        .orderBy(asc(bienUsoInsumos.tipo)),
      db
        .select()
        .from(bienUsoInspecciones)
        .where(and(eq(bienUsoInspecciones.bienId, id), eq(bienUsoInspecciones.guarderiaId, gId)))
        .orderBy(desc(bienUsoInspecciones.fecha)),
    ]);

  const urls = await firmarArchivos([
    b.seguroArchivoPath,
    ...intervenciones.map((x) => x.i.archivoPath),
    ...inspecciones.map((x) => x.archivoPath),
  ]);
  const urlDe = (p: string | null) => (p ? (urls.get(p) ?? null) : null);

  return {
    bien: {
      id: b.id,
      numero: b.numero,
      fechaIncorporacion: b.fechaIncorporacion,
      estado: b.estado,
      estadoDetalle: b.estadoDetalle,
      formaAdquisicion: b.formaAdquisicion,
      tipoBien: b.tipoBien,
      rubro: b.rubro,
      subrubro: b.subrubro,
      nroGuarderia: b.nroGuarderia,
      nombre: b.nombre,
      marca: b.marca,
      nroSerie: b.nroSerie,
      anioFabricacion: b.anioFabricacion,
      patente: b.patente,
      ubicaciones: b.ubicaciones,
      lugaresUtilizacion: b.lugaresUtilizacion,
      horarioNoAplica: b.horarioNoAplica,
      seguroAseguradora: b.seguroAseguradora,
      seguroPoliza: b.seguroPoliza,
      seguroVencimiento: b.seguroVencimiento,
      seguroDetalle: b.seguroDetalle,
      seguroArchivoNombre: b.seguroArchivoNombre,
      seguroUrl: urlDe(b.seguroArchivoPath),
      fechaBaja: b.fechaBaja,
      motivoBaja: b.motivoBaja,
      motivoBajaDetalle: b.motivoBajaDetalle,
      vidaUtilAnios: b.vidaUtilAnios,
      valorOrigen: num(b.valorOrigen),
      moneda: b.moneda,
      fechaInicioAmortizacion: b.fechaInicioAmortizacion,
      valorResidual: Number(b.valorResidual),
      mantenimientoEmails: b.mantenimientoEmails,
      notas: b.notas,
    },
    horarios: horarios.map((h) => ({
      dia: h.dia,
      desde: h.desde.slice(0, 5),
      hasta: h.hasta.slice(0, 5),
    })),
    autorizados: vinculados.filter((v) => v.rol === 'autorizado').map((v) => v.empleadoId),
    responsables: vinculados.filter((v) => v.rol === 'mantenimiento').map((v) => v.empleadoId),
    planes: planes.map((p) => ({
      id: p.id,
      descripcion: p.descripcion,
      frecuenciaTipo: p.frecuenciaTipo,
      frecuenciaValor: p.frecuenciaValor,
      proximaFecha: p.proximaFecha,
      ultimaFecha: p.ultimaFecha,
      activo: p.activo,
      notas: p.notas,
    })),
    intervenciones: intervenciones.map(({ i, proveedor }) => ({
      id: i.id,
      fecha: i.fecha,
      tipo: i.tipo,
      descripcion: i.descripcion,
      repuestos: i.repuestos,
      proveedorId: i.proveedorId,
      proveedorNombre: proveedor,
      costo: num(i.costo),
      moneda: i.moneda,
      planId: i.planId,
      archivoNombre: i.archivoNombre,
      url: urlDe(i.archivoPath),
    })),
    fallas: fallas.map((f) => ({
      id: f.id,
      fecha: f.fecha,
      tipo: f.tipo,
      descripcion: f.descripcion,
      accionCorrectiva: f.accionCorrectiva,
      fechaResolucion: f.fechaResolucion,
    })),
    insumos: insumos.map((x) => ({
      id: x.id,
      tipo: x.tipo,
      descripcion: x.descripcion,
      ultimoCambio: x.ultimoCambio,
      frecuenciaValor: x.frecuenciaValor,
      frecuenciaTipo: x.frecuenciaTipo,
      notas: x.notas,
    })),
    inspecciones: inspecciones.map((x) => ({
      id: x.id,
      fecha: x.fecha,
      tipo: x.tipo,
      resultado: x.resultado,
      inspector: x.inspector,
      observaciones: x.observaciones,
      archivoNombre: x.archivoNombre,
      url: urlDe(x.archivoPath),
    })),
  };
}

// ─── Listas desplegables ────────────────────────────────────────────────────

/**
 * Opciones de cada lista: las sugerencias, lo que agregó el club, sus áreas de Espacios como
 * ubicaciones y lo que ya usan sus bienes (para que una opción vieja no desaparezca).
 */
export async function catalogosBienes(gId: string): Promise<CatalogosDisponibles> {
  const [out, areasClub, usados, interv, fallas, insumos, inspec] = await Promise.all([
    catalogosBaseDelClub(gId),
    db.select({ nombre: areas.nombre }).from(areas).where(eq(areas.guarderiaId, gId)),
    db
      .select({
        tipoBien: bienesUso.tipoBien,
        rubro: bienesUso.rubro,
        subrubro: bienesUso.subrubro,
        marca: bienesUso.marca,
        ubicaciones: bienesUso.ubicaciones,
        lugares: bienesUso.lugaresUtilizacion,
        aseguradora: bienesUso.seguroAseguradora,
        motivoBaja: bienesUso.motivoBaja,
      })
      .from(bienesUso)
      .where(eq(bienesUso.guarderiaId, gId)),
    db
      .select({ v: bienUsoIntervenciones.tipo })
      .from(bienUsoIntervenciones)
      .where(eq(bienUsoIntervenciones.guarderiaId, gId)),
    db
      .select({ v: bienUsoFallas.tipo })
      .from(bienUsoFallas)
      .where(eq(bienUsoFallas.guarderiaId, gId)),
    db
      .select({ v: bienUsoInsumos.tipo })
      .from(bienUsoInsumos)
      .where(eq(bienUsoInsumos.guarderiaId, gId)),
    db
      .select({ v: bienUsoInspecciones.tipo })
      .from(bienUsoInspecciones)
      .where(eq(bienUsoInspecciones.guarderiaId, gId)),
  ]);
  const t = (l: (string | null)[]) => l.filter((x): x is string => !!x);

  out.bu_tipo = unirOpciones(out.bu_tipo, t(usados.map((u) => u.tipoBien)));
  out.bu_rubro = unirOpciones(out.bu_rubro, t(usados.map((u) => u.rubro)));
  out.bu_subrubro = unirOpciones(out.bu_subrubro, t(usados.map((u) => u.subrubro)));
  out.bu_marca = unirOpciones(out.bu_marca, t(usados.map((u) => u.marca)));
  out.bu_ubicacion = unirOpciones(
    out.bu_ubicacion,
    areasClub.map((a) => a.nombre),
    usados.flatMap((u) => u.ubicaciones),
  );
  out.bu_lugar = unirOpciones(
    out.bu_lugar,
    usados.flatMap((u) => u.lugares),
  );
  out.bu_aseguradora = unirOpciones(out.bu_aseguradora, t(usados.map((u) => u.aseguradora)));
  out.bu_motivo_baja = unirOpciones(out.bu_motivo_baja, t(usados.map((u) => u.motivoBaja)));
  out.bu_tipo_intervencion = unirOpciones(out.bu_tipo_intervencion, t(interv.map((x) => x.v)));
  out.bu_tipo_falla = unirOpciones(out.bu_tipo_falla, t(fallas.map((x) => x.v)));
  out.bu_tipo_insumo = unirOpciones(out.bu_tipo_insumo, t(insumos.map((x) => x.v)));
  out.bu_tipo_inspeccion = unirOpciones(out.bu_tipo_inspeccion, t(inspec.map((x) => x.v)));
  return out;
}
