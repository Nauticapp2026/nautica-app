/**
 * Consultas del legajo del personal (solo servidor). Todas reciben el `guarderia_id` del admin
 * actual y filtran por él; los datos salen ya serializables (fechas como texto) para pasarlos
 * a las pantallas.
 */

import { and, asc, desc, eq, gte, inArray, lte } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  areas,
  empleadoDocumentos,
  empleadoFamiliares,
  empleadoHistorial,
  empleadoHoras,
  empleadoHorarios,
  empleadoLicencias,
  empleadoReportaA,
  empleadoVacacionesAnuales,
  empleadoVacacionesTomadas,
  empleados,
  memberships,
  profiles,
} from '@/lib/db/schema';
import { addDiasYmd } from '@/lib/dates';
import { unirOpciones, type CatalogosDisponibles } from '@/lib/catalogos-club';
import { ROLES_ADMIN_LICENCIA, ROLES_VINCULABLES } from './constantes';
import { calcularFaltantes, type Faltante } from './completitud';
import { firmarArchivos } from '@/lib/archivos-privados';
import { catalogosBaseDelClub } from '@/lib/catalogos-club-server';
import { calcularHoras } from './validaciones';

const nombreCompleto = (n: string | null, a: string | null) => [a, n].filter(Boolean).join(', ');

// ─── Lista de legajos ───────────────────────────────────────────────────────

export type FilaLegajo = {
  id: string;
  numero: number;
  nombre: string;
  apellido: string;
  tipoDocumento: string;
  nroDocumento: string;
  puesto: string | null;
  area: string | null;
  sedes: string[];
  estado: string;
  fechaIngreso: string;
  /** Cantidad de datos obligatorios que faltan cargar. */
  faltan: number;
  /** Usuario del sistema vinculado (opcional). */
  tieneUsuario: boolean;
};

export async function listarLegajos(gId: string): Promise<FilaLegajo[]> {
  const [emps, docs, horarios] = await Promise.all([
    db
      .select()
      .from(empleados)
      .where(eq(empleados.guarderiaId, gId))
      .orderBy(asc(empleados.apellido), asc(empleados.nombre)),
    db
      .select({
        empleadoId: empleadoDocumentos.empleadoId,
        tipo: empleadoDocumentos.tipo,
        posee: empleadoDocumentos.posee,
        archivoPath: empleadoDocumentos.archivoPath,
      })
      .from(empleadoDocumentos)
      .where(eq(empleadoDocumentos.guarderiaId, gId)),
    db
      .selectDistinct({ empleadoId: empleadoHorarios.empleadoId })
      .from(empleadoHorarios)
      .where(eq(empleadoHorarios.guarderiaId, gId)),
  ]);

  const docsPorEmpleado = new Map<
    string,
    { tipo: string; posee: boolean; tieneArchivo: boolean }[]
  >();
  for (const d of docs) {
    const l = docsPorEmpleado.get(d.empleadoId) ?? [];
    l.push({ tipo: d.tipo, posee: d.posee, tieneArchivo: !!d.archivoPath });
    docsPorEmpleado.set(d.empleadoId, l);
  }
  const conHorario = new Set(horarios.map((h) => h.empleadoId));

  return emps.map((e) => ({
    id: e.id,
    numero: e.numero,
    nombre: e.nombre,
    apellido: e.apellido,
    tipoDocumento: e.tipoDocumento,
    nroDocumento: e.nroDocumento,
    puesto: e.puesto,
    area: e.area,
    sedes: e.sedes,
    estado: e.estado,
    fechaIngreso: e.fechaIngreso,
    // Un legajo dado de baja ya no se completa: no se le marcan faltantes.
    faltan:
      e.estado === 'baja'
        ? 0
        : calcularFaltantes(e, docsPorEmpleado.get(e.id) ?? [], conHorario.has(e.id)).faltantes
            .length,
    tieneUsuario: !!e.profileId,
  }));
}

// ─── Un legajo completo ─────────────────────────────────────────────────────

export type PersonaSelector = { value: string; label: string; detalle?: string };

export type LegajoDetalle = {
  empleado: {
    id: string;
    numero: number;
    profileId: string | null;
    nombre: string;
    apellido: string;
    tipoDocumento: string;
    nroDocumento: string;
    cuilCuit: string | null;
    fechaNacimiento: string | null;
    genero: string | null;
    direccion: string | null;
    localidad: string | null;
    provincia: string | null;
    telefono: string | null;
    email: string | null;
    fechaIngreso: string;
    fechaIngresoArca: string | null;
    tipoContratacion: string | null;
    puesto: string | null;
    tareas: string | null;
    area: string | null;
    sedes: string[];
    ubicaciones: string[];
    bienesUso: string[];
    convenio: string | null;
    categoria: string | null;
    estado: string;
    fechaEgreso: string | null;
    motivoEgreso: string | null;
    obraSocial: string | null;
    art: string | null;
    aptoMedico: boolean;
    fechaUltimoExamen: string | null;
    banco: string | null;
    cbu: string | null;
    tipoCuenta: string | null;
    nivelEducativo: string | null;
    estadoEducativo: string | null;
    estadoCivil: string | null;
  };
  reportaA: string[];
  horarios: { dia: number; desde: string; hasta: string; tipoHora: string }[];
  familiares: {
    id: string;
    parentesco: string;
    nombre: string;
    apellido: string;
    nroDocumento: string | null;
    fechaNacimiento: string | null;
    aCargo: boolean;
    asignacionFamiliar: boolean;
    extensionObraSocial: boolean;
    observaciones: string | null;
  }[];
  documentos: Record<
    string,
    { posee: boolean; vencimiento: string | null; archivoNombre: string | null; url: string | null }
  >;
  vacaciones: {
    anuales: { anio: number; diasTotales: number }[];
    tomadas: {
      id: string;
      anio: number;
      desde: string;
      hasta: string;
      dias: number;
      nota: string | null;
    }[];
  };
  licencias: {
    id: string;
    tipo: string;
    fechaAlta: string;
    fechaIncorporacion: string | null;
    motivo: string | null;
    certificadoNombre: string | null;
    certificadoUrl: string | null;
    aprobadorValor: string;
    aprobadorTexto: string | null;
  }[];
  historial: {
    id: string;
    campo: string;
    anterior: string | null;
    nuevo: string | null;
    por: string | null;
    cuando: string;
  }[];
  usuario: { id: string; nombre: string; email: string | null; rol: string | null } | null;
  faltantes: Faltante[];
  avisos: Faltante[];
};

export async function obtenerLegajo(gId: string, id: string): Promise<LegajoDetalle | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [e] = await db
    .select()
    .from(empleados)
    .where(and(eq(empleados.id, id), eq(empleados.guarderiaId, gId)))
    .limit(1);
  if (!e) return null;

  const [reporta, horarios, familiares, docs, anuales, tomadas, licencias, historial] =
    await Promise.all([
      db
        .select({ jefeId: empleadoReportaA.jefeId })
        .from(empleadoReportaA)
        .where(eq(empleadoReportaA.empleadoId, id)),
      db
        .select()
        .from(empleadoHorarios)
        .where(eq(empleadoHorarios.empleadoId, id))
        .orderBy(asc(empleadoHorarios.dia), asc(empleadoHorarios.desde)),
      db
        .select()
        .from(empleadoFamiliares)
        .where(eq(empleadoFamiliares.empleadoId, id))
        .orderBy(asc(empleadoFamiliares.createdAt)),
      db.select().from(empleadoDocumentos).where(eq(empleadoDocumentos.empleadoId, id)),
      db
        .select()
        .from(empleadoVacacionesAnuales)
        .where(eq(empleadoVacacionesAnuales.empleadoId, id))
        .orderBy(desc(empleadoVacacionesAnuales.anio)),
      db
        .select()
        .from(empleadoVacacionesTomadas)
        .where(eq(empleadoVacacionesTomadas.empleadoId, id))
        .orderBy(desc(empleadoVacacionesTomadas.desde)),
      db
        .select()
        .from(empleadoLicencias)
        .where(eq(empleadoLicencias.empleadoId, id))
        .orderBy(desc(empleadoLicencias.fechaAlta)),
      db
        .select()
        .from(empleadoHistorial)
        .where(eq(empleadoHistorial.empleadoId, id))
        .orderBy(desc(empleadoHistorial.cambiadoEn))
        .limit(200),
    ]);

  // Nombres de los aprobadores de licencias y de quienes hicieron cambios.
  const idsEmpleados = [
    ...new Set(licencias.map((l) => l.aprobadorEmpleadoId).filter((x): x is string => !!x)),
  ];
  const idsPerfiles = [
    ...new Set(
      [
        ...licencias.map((l) => l.aprobadorProfileId),
        ...historial.map((h) => h.cambiadoPor),
        e.profileId,
      ].filter((x): x is string => !!x),
    ),
  ];
  const [empleadosAprob, perfiles, membresia] = await Promise.all([
    idsEmpleados.length
      ? db
          .select({ id: empleados.id, nombre: empleados.nombre, apellido: empleados.apellido })
          .from(empleados)
          .where(and(eq(empleados.guarderiaId, gId), inArray(empleados.id, idsEmpleados)))
      : Promise.resolve([]),
    idsPerfiles.length
      ? db
          .select({
            id: profiles.id,
            nombre: profiles.nombre,
            apellido: profiles.apellido,
            email: profiles.email,
          })
          .from(profiles)
          .where(inArray(profiles.id, idsPerfiles))
      : Promise.resolve([]),
    e.profileId
      ? db
          .select({ rol: memberships.rol })
          .from(memberships)
          .where(
            and(
              eq(memberships.userId, e.profileId),
              eq(memberships.guarderiaId, gId),
              eq(memberships.status, 'active'),
            ),
          )
          .limit(1)
      : Promise.resolve([]),
  ]);
  const nombreEmpleado = new Map(
    empleadosAprob.map((x) => [x.id, nombreCompleto(x.nombre, x.apellido)]),
  );
  const nombrePerfil = new Map(
    perfiles.map((p) => [p.id, nombreCompleto(p.nombre, p.apellido) || p.email || '—']),
  );

  const urls = await firmarArchivos([
    ...docs.map((d) => d.archivoPath),
    ...licencias.map((l) => l.certificadoPath),
  ]);

  const documentos: LegajoDetalle['documentos'] = {};
  for (const d of docs) {
    documentos[d.tipo] = {
      posee: d.posee,
      vencimiento: d.vencimiento,
      archivoNombre: d.archivoNombre,
      url: d.archivoPath ? (urls.get(d.archivoPath) ?? null) : null,
    };
  }

  const { faltantes, avisos } =
    e.estado === 'baja'
      ? { faltantes: [], avisos: [] }
      : calcularFaltantes(
          e,
          docs.map((d) => ({ tipo: d.tipo, posee: d.posee, tieneArchivo: !!d.archivoPath })),
          horarios.length > 0,
        );

  const perfilVinculado = e.profileId ? perfiles.find((p) => p.id === e.profileId) : null;

  return {
    empleado: {
      id: e.id,
      numero: e.numero,
      profileId: e.profileId,
      nombre: e.nombre,
      apellido: e.apellido,
      tipoDocumento: e.tipoDocumento,
      nroDocumento: e.nroDocumento,
      cuilCuit: e.cuilCuit,
      fechaNacimiento: e.fechaNacimiento,
      genero: e.genero,
      direccion: e.direccion,
      localidad: e.localidad,
      provincia: e.provincia,
      telefono: e.telefono,
      email: e.email,
      fechaIngreso: e.fechaIngreso,
      fechaIngresoArca: e.fechaIngresoArca,
      tipoContratacion: e.tipoContratacion,
      puesto: e.puesto,
      tareas: e.tareas,
      area: e.area,
      sedes: e.sedes,
      ubicaciones: e.ubicaciones,
      bienesUso: e.bienesUso,
      convenio: e.convenio,
      categoria: e.categoria,
      estado: e.estado,
      fechaEgreso: e.fechaEgreso,
      motivoEgreso: e.motivoEgreso,
      obraSocial: e.obraSocial,
      art: e.art,
      aptoMedico: e.aptoMedico,
      fechaUltimoExamen: e.fechaUltimoExamen,
      banco: e.banco,
      cbu: e.cbu,
      tipoCuenta: e.tipoCuenta,
      nivelEducativo: e.nivelEducativo,
      estadoEducativo: e.estadoEducativo,
      estadoCivil: e.estadoCivil,
    },
    reportaA: reporta.map((r) => r.jefeId),
    horarios: horarios.map((h) => ({
      dia: h.dia,
      desde: h.desde.slice(0, 5),
      hasta: h.hasta.slice(0, 5),
      tipoHora: h.tipoHora,
    })),
    familiares: familiares.map((f) => ({
      id: f.id,
      parentesco: f.parentesco,
      nombre: f.nombre,
      apellido: f.apellido,
      nroDocumento: f.nroDocumento,
      fechaNacimiento: f.fechaNacimiento,
      aCargo: f.aCargo,
      asignacionFamiliar: f.asignacionFamiliar,
      extensionObraSocial: f.extensionObraSocial,
      observaciones: f.observaciones,
    })),
    documentos,
    vacaciones: {
      anuales: anuales.map((a) => ({ anio: a.anio, diasTotales: a.diasTotales })),
      tomadas: tomadas.map((t) => ({
        id: t.id,
        anio: t.anio,
        desde: t.desde,
        hasta: t.hasta,
        dias: t.dias,
        nota: t.nota,
      })),
    },
    licencias: licencias.map((l) => ({
      id: l.id,
      tipo: l.tipo,
      fechaAlta: l.fechaAlta,
      fechaIncorporacion: l.fechaIncorporacion,
      motivo: l.motivo,
      certificadoNombre: l.certificadoNombre,
      certificadoUrl: l.certificadoPath ? (urls.get(l.certificadoPath) ?? null) : null,
      aprobadorValor: l.aprobadorEmpleadoId
        ? `empleado:${l.aprobadorEmpleadoId}`
        : l.aprobadorProfileId
          ? `usuario:${l.aprobadorProfileId}`
          : '',
      aprobadorTexto: l.aprobadorEmpleadoId
        ? (nombreEmpleado.get(l.aprobadorEmpleadoId) ?? null)
        : l.aprobadorProfileId
          ? (nombrePerfil.get(l.aprobadorProfileId) ?? null)
          : null,
    })),
    historial: historial.map((h) => ({
      id: h.id,
      campo: h.campo,
      anterior: h.valorAnterior,
      nuevo: h.valorNuevo,
      por: h.cambiadoPor ? (nombrePerfil.get(h.cambiadoPor) ?? null) : null,
      cuando: h.cambiadoEn.toISOString(),
    })),
    usuario:
      e.profileId && perfilVinculado
        ? {
            id: e.profileId,
            nombre:
              nombreCompleto(perfilVinculado.nombre, perfilVinculado.apellido) ||
              perfilVinculado.email ||
              '—',
            email: perfilVinculado.email,
            rol: membresia[0]?.rol ?? null,
          }
        : null,
    faltantes,
    avisos,
  };
}

// ─── Listas desplegables ────────────────────────────────────────────────────

/**
 * Opciones de cada lista: las sugerencias base, lo que ya existe en el club (su nombre como
 * sede, sus áreas de Espacios como ubicaciones) y lo que el club fue agregando. Además suma
 * los valores que ya usa algún legajo, para que una opción vieja no desaparezca.
 */
export async function catalogosDelClub(
  gId: string,
  clubNombre: string,
): Promise<CatalogosDisponibles> {
  const [out, areasClub, usados] = await Promise.all([
    catalogosBaseDelClub(gId),
    db.select({ nombre: areas.nombre }).from(areas).where(eq(areas.guarderiaId, gId)),
    db
      .select({
        tipoContratacion: empleados.tipoContratacion,
        puesto: empleados.puesto,
        area: empleados.area,
        sedes: empleados.sedes,
        ubicaciones: empleados.ubicaciones,
        bienesUso: empleados.bienesUso,
        convenio: empleados.convenio,
        categoria: empleados.categoria,
        obraSocial: empleados.obraSocial,
        art: empleados.art,
        banco: empleados.banco,
      })
      .from(empleados)
      .where(eq(empleados.guarderiaId, gId)),
  ]);

  const usadosPor = (f: (u: (typeof usados)[number]) => (string | null)[] | string | null) =>
    usados.flatMap((u) => {
      const v = f(u);
      return Array.isArray(v) ? v.filter((x): x is string => !!x) : v ? [v] : [];
    });

  out.sede = unirOpciones(
    out.sede,
    [clubNombre],
    usadosPor((u) => u.sedes),
  );
  out.ubicacion = unirOpciones(
    out.ubicacion,
    areasClub.map((a) => a.nombre),
    usadosPor((u) => u.ubicaciones),
  );
  out.tipo_contratacion = unirOpciones(
    out.tipo_contratacion,
    usadosPor((u) => u.tipoContratacion),
  );
  out.puesto = unirOpciones(
    out.puesto,
    usadosPor((u) => u.puesto),
  );
  out.area = unirOpciones(
    out.area,
    usadosPor((u) => u.area),
  );
  out.bien_uso = unirOpciones(
    out.bien_uso,
    usadosPor((u) => u.bienesUso),
  );
  out.convenio = unirOpciones(
    out.convenio,
    usadosPor((u) => u.convenio),
  );
  out.categoria = unirOpciones(
    out.categoria,
    usadosPor((u) => u.categoria),
  );
  out.obra_social = unirOpciones(
    out.obra_social,
    usadosPor((u) => u.obraSocial),
  );
  out.art = unirOpciones(
    out.art,
    usadosPor((u) => u.art),
  );
  out.banco = unirOpciones(
    out.banco,
    usadosPor((u) => u.banco),
  );
  return out;
}

// ─── Selectores de personas ─────────────────────────────────────────────────

/** Legajos del club para los desplegables "Reporta a" y "Aprobador". */
export async function personalParaSelector(gId: string): Promise<PersonaSelector[]> {
  const rows = await db
    .select({
      id: empleados.id,
      nombre: empleados.nombre,
      apellido: empleados.apellido,
      puesto: empleados.puesto,
      estado: empleados.estado,
    })
    .from(empleados)
    .where(eq(empleados.guarderiaId, gId))
    .orderBy(asc(empleados.apellido), asc(empleados.nombre));
  return rows
    .filter((r) => r.estado !== 'baja')
    .map((r) => ({
      value: r.id,
      label: nombreCompleto(r.nombre, r.apellido),
      detalle: r.puesto ?? undefined,
    }));
}

/** Administradores del club que pueden aprobar licencias (aparte del personal con legajo). */
export async function adminsParaAprobar(gId: string): Promise<PersonaSelector[]> {
  const rows = await db
    .select({
      id: profiles.id,
      nombre: profiles.nombre,
      apellido: profiles.apellido,
      email: profiles.email,
    })
    .from(memberships)
    .innerJoin(profiles, eq(profiles.id, memberships.userId))
    .where(
      and(
        eq(memberships.guarderiaId, gId),
        eq(memberships.status, 'active'),
        inArray(memberships.rol, [...ROLES_ADMIN_LICENCIA]),
      ),
    );
  return rows
    .map((r) => ({ value: r.id, label: nombreCompleto(r.nombre, r.apellido) || r.email || '—' }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es'));
}

export type UsuarioVinculable = {
  id: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  rol: string;
};

/** Personal con usuario en el sistema que todavía no tiene legajo en este club. */
export async function usuariosVinculables(
  gId: string,
  incluirDeEmpleadoId?: string,
): Promise<UsuarioVinculable[]> {
  const [miembros, vinculados] = await Promise.all([
    db
      .select({
        id: profiles.id,
        nombre: profiles.nombre,
        apellido: profiles.apellido,
        email: profiles.email,
        telefono: profiles.telefono,
        rol: memberships.rol,
      })
      .from(memberships)
      .innerJoin(profiles, eq(profiles.id, memberships.userId))
      .where(
        and(
          eq(memberships.guarderiaId, gId),
          eq(memberships.status, 'active'),
          inArray(memberships.rol, [...ROLES_VINCULABLES]),
        ),
      ),
    db
      .select({ profileId: empleados.profileId, id: empleados.id })
      .from(empleados)
      .where(eq(empleados.guarderiaId, gId)),
  ]);
  const ocupados = new Set(
    vinculados
      .filter((v) => v.profileId && v.id !== incluirDeEmpleadoId)
      .map((v) => v.profileId as string),
  );
  return miembros
    .filter((m) => !ocupados.has(m.id))
    .map((m) => ({
      id: m.id,
      nombre: nombreCompleto(m.nombre, m.apellido) || m.email || '—',
      email: m.email,
      telefono: m.telefono,
      rol: m.rol,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

// ─── Horas del empleado en un mes ───────────────────────────────────────────

export type HoraRegistrada = {
  id: string;
  fecha: string;
  desde: string | null;
  hasta: string | null;
  horas: number;
  tipoHora: string;
  novedad: string;
  nota: string | null;
};

/** Primer y último día de un mes 'YYYY-MM'. */
export function rangoDelMes(mes: string): { desde: string; hasta: string } {
  const [y, m] = mes.split('-').map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, '0')}` };
}

export async function horasDelEmpleado(
  gId: string,
  empleadoId: string,
  mes: string,
): Promise<HoraRegistrada[]> {
  const { desde, hasta } = rangoDelMes(mes);
  const rows = await db
    .select()
    .from(empleadoHoras)
    .where(
      and(
        eq(empleadoHoras.guarderiaId, gId),
        eq(empleadoHoras.empleadoId, empleadoId),
        gte(empleadoHoras.fecha, desde),
        lte(empleadoHoras.fecha, hasta),
      ),
    )
    .orderBy(asc(empleadoHoras.fecha), asc(empleadoHoras.desde));
  return rows.map((r) => ({
    id: r.id,
    fecha: r.fecha,
    desde: r.desde ? r.desde.slice(0, 5) : null,
    hasta: r.hasta ? r.hasta.slice(0, 5) : null,
    horas: Number(r.horas),
    tipoHora: r.tipoHora,
    novedad: r.novedad,
    nota: r.nota,
  }));
}

// ─── Programación semanal ───────────────────────────────────────────────────

export type CeldaSemana = {
  /** 'real' = horas cargadas; 'plan' = horario previsto; el resto, una novedad. */
  tipo: 'real' | 'plan' | 'vacaciones' | 'licencia' | 'novedad' | 'vacio';
  texto: string;
  horas: number;
};

export type FilaSemana = {
  empleadoId: string;
  nombre: string;
  puesto: string | null;
  celdas: CeldaSemana[];
  totalHoras: number;
};

const LABEL_NOVEDAD: Record<string, string> = {
  trabajado: 'Trabajado',
  enfermedad: 'Enfermedad',
  licencia: 'Licencia',
  vacaciones: 'Vacaciones',
  ausencia: 'Ausencia',
  feriado: 'Feriado',
};

/** Día de la semana de una fecha 'YYYY-MM-DD': 1 = lunes … 7 = domingo. */
export function diaDeSemana(ymd: string): number {
  const d = new Date(`${ymd}T12:00:00.000Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/** Lunes de la semana de una fecha. */
export function lunesDe(ymd: string): string {
  return addDiasYmd(ymd, -(diaDeSemana(ymd) - 1));
}

/**
 * Planilla de la semana (lunes a domingo): por empleado y por día, lo que se cargó de horas
 * reales; si no hay nada cargado, el horario previsto; y las vacaciones y licencias en curso.
 * Reemplaza a la planilla de turnos en Excel.
 */
export async function grillaSemanal(
  gId: string,
  lunes: string,
): Promise<{ dias: string[]; filas: FilaSemana[] }> {
  const dias = Array.from({ length: 7 }, (_, i) => addDiasYmd(lunes, i));
  const domingo = dias[6];

  const emps = await db
    .select({
      id: empleados.id,
      nombre: empleados.nombre,
      apellido: empleados.apellido,
      puesto: empleados.puesto,
      estado: empleados.estado,
      fechaIngreso: empleados.fechaIngreso,
      fechaEgreso: empleados.fechaEgreso,
    })
    .from(empleados)
    .where(eq(empleados.guarderiaId, gId))
    .orderBy(asc(empleados.apellido), asc(empleados.nombre));
  const vigentes = emps.filter(
    (e) =>
      e.fechaIngreso <= domingo &&
      (!e.fechaEgreso || e.fechaEgreso >= lunes) &&
      e.estado !== 'baja',
  );
  if (vigentes.length === 0) return { dias, filas: [] };
  const ids = vigentes.map((e) => e.id);

  const [horas, horarios, vacas, licenciasTodas] = await Promise.all([
    db
      .select()
      .from(empleadoHoras)
      .where(
        and(
          eq(empleadoHoras.guarderiaId, gId),
          inArray(empleadoHoras.empleadoId, ids),
          gte(empleadoHoras.fecha, lunes),
          lte(empleadoHoras.fecha, domingo),
        ),
      ),
    db
      .select()
      .from(empleadoHorarios)
      .where(and(eq(empleadoHorarios.guarderiaId, gId), inArray(empleadoHorarios.empleadoId, ids))),
    db
      .select()
      .from(empleadoVacacionesTomadas)
      .where(
        and(
          eq(empleadoVacacionesTomadas.guarderiaId, gId),
          inArray(empleadoVacacionesTomadas.empleadoId, ids),
          lte(empleadoVacacionesTomadas.desde, domingo),
          gte(empleadoVacacionesTomadas.hasta, lunes),
        ),
      ),
    db
      .select()
      .from(empleadoLicencias)
      .where(
        and(
          eq(empleadoLicencias.guarderiaId, gId),
          inArray(empleadoLicencias.empleadoId, ids),
          lte(empleadoLicencias.fechaAlta, domingo),
        ),
      ),
  ]);
  // Las licencias que ya terminaron antes de esta semana no cuentan; las que no tienen fecha de
  // incorporación siguen en curso.
  const licencias = licenciasTodas.filter(
    (l) => !l.fechaIncorporacion || l.fechaIncorporacion > lunes,
  );

  const filas: FilaSemana[] = vigentes.map((e) => {
    let total = 0;
    const celdas = dias.map((fecha): CeldaSemana => {
      if (vacas.some((v) => v.empleadoId === e.id && v.desde <= fecha && v.hasta >= fecha)) {
        return { tipo: 'vacaciones', texto: 'Vacaciones', horas: 0 };
      }
      // La reincorporación es el primer día de vuelta: la licencia cubre hasta el día anterior.
      const lic = licencias.find(
        (l) =>
          l.empleadoId === e.id &&
          l.fechaAlta <= fecha &&
          (!l.fechaIncorporacion || l.fechaIncorporacion > fecha),
      );
      if (lic) return { tipo: 'licencia', texto: `Licencia · ${lic.tipo}`, horas: 0 };

      const reales = horas.filter((h) => h.empleadoId === e.id && h.fecha === fecha);
      if (reales.length > 0) {
        const trabajadas = reales.filter((h) => h.novedad === 'trabajado');
        const h = trabajadas.reduce((acc, x) => acc + Number(x.horas), 0);
        total += h;
        const partes = reales.map((x) =>
          x.novedad === 'trabajado' && x.desde && x.hasta
            ? `${x.desde.slice(0, 5)}–${x.hasta.slice(0, 5)}`
            : (LABEL_NOVEDAD[x.novedad] ?? x.novedad),
        );
        const soloNovedad = trabajadas.length === 0;
        return { tipo: soloNovedad ? 'novedad' : 'real', texto: partes.join(' · '), horas: h };
      }

      const previstos = horarios
        .filter((p) => p.empleadoId === e.id && p.dia === diaDeSemana(fecha))
        .sort((a, b) => a.desde.localeCompare(b.desde));
      if (previstos.length > 0) {
        const h = previstos.reduce((acc, p) => acc + calcularHoras(p.desde, p.hasta), 0);
        total += h;
        return {
          tipo: 'plan',
          texto: previstos.map((p) => `${p.desde.slice(0, 5)}–${p.hasta.slice(0, 5)}`).join(' · '),
          horas: h,
        };
      }
      return { tipo: 'vacio', texto: '', horas: 0 };
    });
    return {
      empleadoId: e.id,
      nombre: nombreCompleto(e.nombre, e.apellido),
      puesto: e.puesto,
      celdas,
      totalHoras: Math.round(total * 100) / 100,
    };
  });

  return { dias, filas };
}

// ─── Novedades del período (para liquidación de sueldos) ────────────────────

export type FilaNovedades = {
  empleadoId: string;
  numero: number;
  nombre: string;
  puesto: string | null;
  diasTrabajados: number;
  /** Horas trabajadas por tipo de hora (value de TIPOS_HORA). */
  horasPorTipo: Record<string, number>;
  horasTotales: number;
  diasEnfermedad: number;
  diasLicencia: number;
  diasVacaciones: number;
  diasAusencia: number;
  diasFeriado: number;
};

/** Días (YYYY-MM-DD) de [desde, hasta] que caen dentro de [lo, hi]. */
function diasEnRango(desde: string, hasta: string, lo: string, hi: string): string[] {
  const out: string[] = [];
  let d = desde < lo ? lo : desde;
  const fin = hasta > hi ? hi : hasta;
  while (d <= fin) {
    out.push(d);
    d = addDiasYmd(d, 1);
  }
  return out;
}

/**
 * Resumen mensual por empleado: días trabajados, horas por tipo y días de enfermedad,
 * licencia, vacaciones, ausencia y feriado. Es lo que el área de liquidación necesita para
 * calcular. Las vacaciones y licencias salen de sus propios registros (con fechas) y de las
 * novedades cargadas día por día, sin contar dos veces el mismo día.
 */
export async function novedadesDelPeriodo(gId: string, mes: string): Promise<FilaNovedades[]> {
  const { desde, hasta } = rangoDelMes(mes);

  const emps = await db
    .select()
    .from(empleados)
    .where(eq(empleados.guarderiaId, gId))
    .orderBy(asc(empleados.apellido), asc(empleados.nombre));
  const vigentes = emps.filter(
    (e) => e.fechaIngreso <= hasta && (!e.fechaEgreso || e.fechaEgreso >= desde),
  );
  if (vigentes.length === 0) return [];
  const ids = vigentes.map((e) => e.id);

  const [horas, vacas, lics] = await Promise.all([
    db
      .select()
      .from(empleadoHoras)
      .where(
        and(
          eq(empleadoHoras.guarderiaId, gId),
          inArray(empleadoHoras.empleadoId, ids),
          gte(empleadoHoras.fecha, desde),
          lte(empleadoHoras.fecha, hasta),
        ),
      ),
    db
      .select()
      .from(empleadoVacacionesTomadas)
      .where(
        and(
          eq(empleadoVacacionesTomadas.guarderiaId, gId),
          inArray(empleadoVacacionesTomadas.empleadoId, ids),
          lte(empleadoVacacionesTomadas.desde, hasta),
          gte(empleadoVacacionesTomadas.hasta, desde),
        ),
      ),
    db
      .select()
      .from(empleadoLicencias)
      .where(
        and(
          eq(empleadoLicencias.guarderiaId, gId),
          inArray(empleadoLicencias.empleadoId, ids),
          lte(empleadoLicencias.fechaAlta, hasta),
        ),
      ),
  ]);

  return vigentes.map((e) => {
    const sets: Record<string, Set<string>> = {
      trabajado: new Set(),
      enfermedad: new Set(),
      licencia: new Set(),
      vacaciones: new Set(),
      ausencia: new Set(),
      feriado: new Set(),
    };
    const horasPorTipo: Record<string, number> = {};
    for (const h of horas.filter((x) => x.empleadoId === e.id)) {
      sets[h.novedad]?.add(h.fecha);
      if (h.novedad === 'trabajado') {
        horasPorTipo[h.tipoHora] =
          Math.round(((horasPorTipo[h.tipoHora] ?? 0) + Number(h.horas)) * 100) / 100;
      }
    }
    for (const v of vacas.filter((x) => x.empleadoId === e.id)) {
      for (const d of diasEnRango(v.desde, v.hasta, desde, hasta)) sets.vacaciones.add(d);
    }
    for (const l of lics.filter((x) => x.empleadoId === e.id)) {
      // Cubre hasta el día anterior a la reincorporación; sin fecha de vuelta, sigue en curso.
      const fin = l.fechaIncorporacion ? addDiasYmd(l.fechaIncorporacion, -1) : hasta;
      for (const d of diasEnRango(l.fechaAlta, fin, desde, hasta)) sets.licencia.add(d);
    }
    const total = Object.values(horasPorTipo).reduce((a, b) => a + b, 0);
    return {
      empleadoId: e.id,
      numero: e.numero,
      nombre: nombreCompleto(e.nombre, e.apellido),
      puesto: e.puesto,
      diasTrabajados: sets.trabajado.size,
      horasPorTipo,
      horasTotales: Math.round(total * 100) / 100,
      diasEnfermedad: sets.enfermedad.size,
      diasLicencia: sets.licencia.size,
      diasVacaciones: sets.vacaciones.size,
      diasAusencia: sets.ausencia.size,
      diasFeriado: sets.feriado.size,
    };
  });
}
