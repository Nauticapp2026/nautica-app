'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray, max, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db';
import {
  empleadoFamiliares,
  empleadoHistorial,
  empleadoReportaA,
  empleados,
  memberships,
  profiles,
} from '@/lib/db/schema';
import { contextoAdmin, esError, type ContextoAdmin } from '@/lib/auth/contexto-admin';
import { empleadoDelClub } from '@/lib/legajo/acceso';
import {
  ESTADOS_CIVILES,
  ESTADOS_EDUCATIVOS,
  ESTADOS_EMPLEADO,
  GENEROS,
  NIVELES_EDUCATIVOS,
  PARENTESCOS,
  ROLES_VINCULABLES,
  TIPOS_CUENTA,
  TIPOS_DOCUMENTO_PERSONA,
} from '@/lib/legajo/constantes';
import {
  enumOpc,
  enumReq,
  listaTextos,
  primerError,
  textoOpc,
  textoReq,
  uuid,
  uuidOpc,
  ymdOpc,
  ymdReq,
} from '@/lib/esquemas-comunes';
import { calcularCambios } from '@/lib/legajo/historial';
import {
  esEmailValido,
  validarCbu,
  validarCuil,
  validarDocumento,
} from '@/lib/legajo/validaciones';

/** `aviso` es un mensaje informativo (la acción se hizo, pero conviene que el admin lo sepa). */
export type ResultadoLegajo = { error?: string; aviso?: string };
export type ResultadoCrearLegajo = ResultadoLegajo & { id?: string };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const VALORES = (l: { value: string }[]) => l.map((o) => o.value);

function revalidar(id?: string) {
  revalidatePath('/personal');
  if (id) revalidatePath(`/personal/${id}`);
}

/** Registra en el historial los campos que cambiaron (dentro de la misma transacción). */
async function guardarCambios(
  tx: Tx,
  c: ContextoAdmin,
  empleadoId: string,
  cambios: { campo: string; anterior: string | null; nuevo: string | null }[],
) {
  if (cambios.length === 0) return;
  await tx.insert(empleadoHistorial).values(
    cambios.map((x) => ({
      guarderiaId: c.gId,
      empleadoId,
      campo: x.campo,
      valorAnterior: x.anterior,
      valorNuevo: x.nuevo,
      cambiadoPor: c.userId,
    })),
  );
}

/** Carga el contexto admin y el legajo del club, o un error listo para devolver. */
async function conLegajo(id: string) {
  const c = await contextoAdmin();
  if (esError(c)) return { error: c.error } as const;
  const e = await empleadoDelClub(id, c.gId);
  if (!e) return { error: 'No encontramos ese legajo.' } as const;
  return { c, e } as const;
}

// ─── Alta del legajo ────────────────────────────────────────────────────────

const crearSchema = z.object({
  nombre: textoReq(80, 'Escribí el nombre.'),
  apellido: textoReq(80, 'Escribí el apellido.'),
  tipoDocumento: enumReq(VALORES(TIPOS_DOCUMENTO_PERSONA), 'Elegí el tipo de documento.'),
  nroDocumento: textoReq(30, 'Escribí el número de documento.'),
  fechaIngreso: ymdReq('La fecha de ingreso no es válida.'),
  puesto: textoOpc(80),
  /** Usuario del sistema con el que se vincula (opcional). */
  profileId: uuidOpc,
  /** Copiar email y teléfono del usuario al legajo (una sola vez). */
  copiarDatosUsuario: z.boolean().default(false),
});

/** Usuario de este club que puede vincularse: miembro ACTIVO con rol de personal y sin legajo. */
async function validarVinculo(gId: string, profileId: string, empleadoIdActual?: string) {
  const [m] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, profileId),
        eq(memberships.guarderiaId, gId),
        eq(memberships.status, 'active'),
        inArray(memberships.rol, [...ROLES_VINCULABLES]),
      ),
    )
    .limit(1);
  if (!m) return 'Ese usuario no es personal activo de este club.';
  const [ya] = await db
    .select({ id: empleados.id })
    .from(empleados)
    .where(and(eq(empleados.guarderiaId, gId), eq(empleados.profileId, profileId)))
    .limit(1);
  if (ya && ya.id !== empleadoIdActual) return 'Ese usuario ya está vinculado a otro legajo.';
  return null;
}

/**
 * Crea un legajo con lo mínimo (identidad e ingreso). El resto se completa por solapas; lo
 * que falta queda a la vista como "legajo incompleto". El número de legajo es correlativo por
 * club y lo asigna el sistema.
 */
export async function crearEmpleadoAction(
  input: z.input<typeof crearSchema>,
): Promise<ResultadoCrearLegajo> {
  const c = await contextoAdmin();
  if (esError(c)) return { error: c.error };

  const parsed = crearSchema.safeParse(input);
  if (!parsed.success) return { error: primerError(parsed.error) };
  const d = parsed.data;

  const doc = validarDocumento(d.tipoDocumento, d.nroDocumento);
  if (!doc.ok) return { error: doc.error };

  let email: string | null = null;
  let telefono: string | null = null;
  if (d.profileId) {
    const err = await validarVinculo(c.gId, d.profileId);
    if (err) return { error: err };
    if (d.copiarDatosUsuario) {
      const [p] = await db
        .select({ email: profiles.email, telefono: profiles.telefono })
        .from(profiles)
        .where(eq(profiles.id, d.profileId))
        .limit(1);
      email = p?.email ?? null;
      telefono = p?.telefono ?? null;
    }
  }

  for (let intento = 0; intento < 3; intento++) {
    try {
      const id = await db.transaction(async (tx) => {
        const [fila] = await tx
          .select({ ultimo: max(empleados.numero) })
          .from(empleados)
          .where(eq(empleados.guarderiaId, c.gId));
        const [nuevo] = await tx
          .insert(empleados)
          .values({
            guarderiaId: c.gId,
            numero: (fila?.ultimo ?? 0) + 1,
            profileId: d.profileId,
            nombre: d.nombre,
            apellido: d.apellido,
            tipoDocumento: d.tipoDocumento,
            nroDocumento: doc.valor,
            fechaIngreso: d.fechaIngreso,
            puesto: d.puesto,
            email,
            telefono,
            createdBy: c.userId,
            updatedBy: c.userId,
          })
          .returning({ id: empleados.id });
        await guardarCambios(tx, c, nuevo.id, [
          { campo: 'Legajo', anterior: null, nuevo: 'Alta del legajo' },
        ]);
        return nuevo.id;
      });
      revalidar();
      return { id };
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('empleados_documento_unico')) {
        return { error: 'Ya existe un legajo con ese tipo y número de documento en este club.' };
      }
      if (msg.includes('empleados_profile_unico')) {
        return { error: 'Ese usuario ya está vinculado a otro legajo.' };
      }
      // Dos altas al mismo tiempo tomaron el mismo número: se reintenta con el siguiente.
      if (msg.includes('empleados_numero_unico')) continue;
      return { error: 'No se pudo crear el legajo.' };
    }
  }
  return { error: 'Se cargaron varios legajos al mismo tiempo. Intentá de nuevo.' };
}

// ─── Solapa: Datos personales ───────────────────────────────────────────────

const personalesSchema = z.object({
  nombre: textoReq(80, 'Escribí el nombre.'),
  apellido: textoReq(80, 'Escribí el apellido.'),
  tipoDocumento: enumReq(VALORES(TIPOS_DOCUMENTO_PERSONA), 'Elegí el tipo de documento.'),
  nroDocumento: textoReq(30, 'Escribí el número de documento.'),
  cuilCuit: textoOpc(20),
  fechaNacimiento: ymdOpc('La fecha de nacimiento no es válida.'),
  genero: enumOpc(VALORES(GENEROS), 'Elegí un género de la lista.'),
  direccion: textoOpc(200),
  localidad: textoOpc(100),
  provincia: textoOpc(100),
  telefono: textoOpc(40),
  email: textoOpc(120),
});

export async function actualizarPersonalesAction(
  id: string,
  input: z.input<typeof personalesSchema>,
): Promise<ResultadoLegajo> {
  const r = await conLegajo(id);
  if ('error' in r) return { error: r.error };
  const { c, e } = r;

  const parsed = personalesSchema.safeParse(input);
  if (!parsed.success) return { error: primerError(parsed.error) };
  const d = parsed.data;

  const doc = validarDocumento(d.tipoDocumento, d.nroDocumento);
  if (!doc.ok) return { error: doc.error };

  let cuil: string | null = null;
  if (d.cuilCuit) {
    const v = validarCuil(d.cuilCuit);
    if (!v.ok) return { error: v.error };
    cuil = v.valor;
  }
  if (d.email && !esEmailValido(d.email)) return { error: 'El email personal no es válido.' };
  if (d.fechaNacimiento && d.fechaNacimiento > new Date().toISOString().slice(0, 10)) {
    return { error: 'La fecha de nacimiento no puede ser futura.' };
  }

  const nuevo = {
    nombre: d.nombre,
    apellido: d.apellido,
    tipoDocumento: d.tipoDocumento,
    nroDocumento: doc.valor,
    cuilCuit: cuil,
    fechaNacimiento: d.fechaNacimiento,
    genero: d.genero,
    direccion: d.direccion,
    localidad: d.localidad,
    provincia: d.provincia,
    telefono: d.telefono,
    email: d.email,
  };

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(empleados)
        .set({ ...nuevo, updatedBy: c.userId, updatedAt: new Date() })
        .where(and(eq(empleados.id, e.id), eq(empleados.guarderiaId, c.gId)));
      await guardarCambios(tx, c, e.id, calcularCambios(e, nuevo));
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes('empleados_documento_unico')) {
      return { error: 'Ya existe otro legajo con ese tipo y número de documento.' };
    }
    return { error: 'No se pudieron guardar los datos personales.' };
  }
  revalidar(e.id);
  return {};
}

// ─── Solapa: Información laboral y contratación ─────────────────────────────

const laboralSchema = z.object({
  fechaIngreso: ymdReq('La fecha de ingreso no es válida.'),
  fechaIngresoArca: ymdOpc('La fecha de ingreso en ARCA no es válida.'),
  tipoContratacion: textoOpc(100),
  puesto: textoOpc(100),
  tareas: textoOpc(2000),
  area: textoOpc(100),
  reportaA: z.array(uuid).max(20).default([]),
  sedes: listaTextos(),
  ubicaciones: listaTextos(),
  bienesUso: listaTextos(),
  convenio: textoOpc(120),
  categoria: textoOpc(120),
  estado: enumReq(VALORES(ESTADOS_EMPLEADO), 'Elegí el estado del empleado.'),
  fechaEgreso: ymdOpc('La fecha de egreso no es válida.'),
  motivoEgreso: textoOpc(500),
});

export async function actualizarLaboralAction(
  id: string,
  input: z.input<typeof laboralSchema>,
): Promise<ResultadoLegajo> {
  const r = await conLegajo(id);
  if ('error' in r) return { error: r.error };
  const { c, e } = r;

  const parsed = laboralSchema.safeParse(input);
  if (!parsed.success) return { error: primerError(parsed.error) };
  const d = parsed.data;

  const esBaja = d.estado === 'baja';
  if (esBaja && !d.fechaEgreso) return { error: 'Para dar de baja indicá la fecha de egreso.' };
  if (d.fechaEgreso && d.fechaEgreso < d.fechaIngreso) {
    return { error: 'La fecha de egreso no puede ser anterior a la de ingreso.' };
  }
  if (d.fechaIngresoArca && d.fechaIngresoArca > d.fechaIngreso) {
    // El alta en ARCA se hace como máximo el día anterior a empezar a trabajar.
    return { error: 'La fecha de ingreso en ARCA no puede ser posterior a la fecha de ingreso.' };
  }

  // "Reporta a": solo legajos de este club y nunca el propio.
  const jefes = d.reportaA.filter((j) => j !== e.id);
  if (jefes.length > 0) {
    const validos = await db
      .select({ id: empleados.id })
      .from(empleados)
      .where(and(eq(empleados.guarderiaId, c.gId), inArray(empleados.id, jefes)));
    if (validos.length !== new Set(jefes).size) {
      return { error: 'Alguna de las personas a quienes reporta no es del personal de este club.' };
    }
  }

  const nuevo = {
    fechaIngreso: d.fechaIngreso,
    fechaIngresoArca: d.fechaIngresoArca,
    tipoContratacion: d.tipoContratacion,
    puesto: d.puesto,
    tareas: d.tareas,
    area: d.area,
    sedes: d.sedes,
    ubicaciones: d.ubicaciones,
    bienesUso: d.bienesUso,
    convenio: d.convenio,
    categoria: d.categoria,
    estado: d.estado,
    // El egreso solo tiene sentido con baja: si el estado vuelve a otro, se limpia.
    fechaEgreso: esBaja ? d.fechaEgreso : null,
    motivoEgreso: esBaja ? d.motivoEgreso : null,
  };

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(empleados)
        .set({ ...nuevo, updatedBy: c.userId, updatedAt: new Date() })
        .where(and(eq(empleados.id, e.id), eq(empleados.guarderiaId, c.gId)));

      // Reemplaza el conjunto de jefes y deja en el historial si cambió.
      const antes = await tx
        .select({ jefeId: empleadoReportaA.jefeId })
        .from(empleadoReportaA)
        .where(eq(empleadoReportaA.empleadoId, e.id));
      const antesIds = antes.map((x) => x.jefeId).sort();
      const nuevosIds = [...new Set(jefes)].sort();
      const cambioJefes = antesIds.join() !== nuevosIds.join();
      if (cambioJefes) {
        await tx.delete(empleadoReportaA).where(eq(empleadoReportaA.empleadoId, e.id));
        if (nuevosIds.length > 0) {
          await tx
            .insert(empleadoReportaA)
            .values(nuevosIds.map((j) => ({ empleadoId: e.id, jefeId: j, guarderiaId: c.gId })));
        }
      }

      const cambios = calcularCambios(e, nuevo);
      if (cambioJefes)
        cambios.push({ campo: 'Posición a reportar', anterior: null, nuevo: 'Modificada' });
      await guardarCambios(tx, c, e.id, cambios);
    });
  } catch {
    return { error: 'No se pudo guardar la información laboral.' };
  }

  revalidar(e.id);
  // El estado del legajo no toca el acceso al sistema: si se da de baja a alguien con usuario
  // activo, se avisa para que el admin lo desactive desde Mi perfil → Equipo.
  if (esBaja && e.estado !== 'baja' && e.profileId) {
    return {
      aviso:
        'Quedó dado de baja. Esta persona tiene un usuario del sistema vinculado y sigue pudiendo ingresar: si ya no debe hacerlo, desactivalo desde Mi perfil → Equipo.',
    };
  }
  return {};
}

// ─── Solapa: Seguridad social, salud y seguros ──────────────────────────────

const seguridadSocialSchema = z.object({
  obraSocial: textoOpc(120),
  art: textoOpc(120),
  aptoMedico: z.boolean(),
  fechaUltimoExamen: ymdOpc('La fecha del último examen no es válida.'),
});

export async function actualizarSeguridadSocialAction(
  id: string,
  input: z.input<typeof seguridadSocialSchema>,
): Promise<ResultadoLegajo> {
  const r = await conLegajo(id);
  if ('error' in r) return { error: r.error };
  const { c, e } = r;

  const parsed = seguridadSocialSchema.safeParse(input);
  if (!parsed.success) return { error: primerError(parsed.error) };
  const nuevo = parsed.data;

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(empleados)
        .set({ ...nuevo, updatedBy: c.userId, updatedAt: new Date() })
        .where(and(eq(empleados.id, e.id), eq(empleados.guarderiaId, c.gId)));
      await guardarCambios(tx, c, e.id, calcularCambios(e, nuevo));
    });
  } catch {
    return { error: 'No se pudieron guardar los datos de seguridad social.' };
  }
  revalidar(e.id);
  return {};
}

// ─── Solapa: Datos financieros ──────────────────────────────────────────────

const financieroSchema = z.object({
  banco: textoOpc(120),
  cbu: textoOpc(40),
  tipoCuenta: enumOpc(VALORES(TIPOS_CUENTA), 'Elegí un tipo de cuenta de la lista.'),
});

export async function actualizarFinancieroAction(
  id: string,
  input: z.input<typeof financieroSchema>,
): Promise<ResultadoLegajo> {
  const r = await conLegajo(id);
  if ('error' in r) return { error: r.error };
  const { c, e } = r;

  const parsed = financieroSchema.safeParse(input);
  if (!parsed.success) return { error: primerError(parsed.error) };
  const d = parsed.data;

  let cbu: string | null = null;
  if (d.cbu) {
    const v = validarCbu(d.cbu);
    if (!v.ok) return { error: v.error };
    cbu = v.valor;
  }
  const nuevo = { banco: d.banco, cbu, tipoCuenta: d.tipoCuenta };

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(empleados)
        .set({ ...nuevo, updatedBy: c.userId, updatedAt: new Date() })
        .where(and(eq(empleados.id, e.id), eq(empleados.guarderiaId, c.gId)));
      await guardarCambios(tx, c, e.id, calcularCambios(e, nuevo));
    });
  } catch {
    return { error: 'No se pudieron guardar los datos financieros.' };
  }
  revalidar(e.id);
  return {};
}

// ─── Solapa: Educación y grupo familiar ─────────────────────────────────────

const educacionSchema = z.object({
  nivelEducativo: enumOpc(VALORES(NIVELES_EDUCATIVOS), 'Elegí un nivel educativo de la lista.'),
  estadoEducativo: enumOpc(VALORES(ESTADOS_EDUCATIVOS), 'Elegí si está completo o incompleto.'),
  estadoCivil: enumOpc(VALORES(ESTADOS_CIVILES), 'Elegí un estado civil de la lista.'),
});

export async function actualizarEducacionAction(
  id: string,
  input: z.input<typeof educacionSchema>,
): Promise<ResultadoLegajo> {
  const r = await conLegajo(id);
  if ('error' in r) return { error: r.error };
  const { c, e } = r;

  const parsed = educacionSchema.safeParse(input);
  if (!parsed.success) return { error: primerError(parsed.error) };
  const nuevo = parsed.data;

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(empleados)
        .set({ ...nuevo, updatedBy: c.userId, updatedAt: new Date() })
        .where(and(eq(empleados.id, e.id), eq(empleados.guarderiaId, c.gId)));
      await guardarCambios(tx, c, e.id, calcularCambios(e, nuevo));
    });
  } catch {
    return { error: 'No se pudieron guardar los datos.' };
  }
  revalidar(e.id);
  return {};
}

const familiarSchema = z.object({
  id: uuidOpc,
  parentesco: enumReq(VALORES(PARENTESCOS), 'Elegí el parentesco.'),
  nombre: textoReq(80, 'Escribí el nombre.'),
  apellido: textoReq(80, 'Escribí el apellido.'),
  nroDocumento: textoOpc(30),
  fechaNacimiento: ymdOpc('La fecha de nacimiento no es válida.'),
  aCargo: z.boolean(),
  asignacionFamiliar: z.boolean(),
  extensionObraSocial: z.boolean(),
  observaciones: textoOpc(500),
});

/** Alta o edición de un familiar a cargo (`id` presente = edición). */
export async function guardarFamiliarAction(
  empleadoId: string,
  input: z.input<typeof familiarSchema>,
): Promise<ResultadoLegajo> {
  const r = await conLegajo(empleadoId);
  if ('error' in r) return { error: r.error };
  const { c, e } = r;

  const parsed = familiarSchema.safeParse(input);
  if (!parsed.success) return { error: primerError(parsed.error) };
  const { id: familiarId, ...datos } = parsed.data;
  if (datos.fechaNacimiento && datos.fechaNacimiento > new Date().toISOString().slice(0, 10)) {
    return { error: 'La fecha de nacimiento no puede ser futura.' };
  }

  try {
    if (familiarId) {
      const upd = await db
        .update(empleadoFamiliares)
        .set(datos)
        .where(
          and(
            eq(empleadoFamiliares.id, familiarId),
            eq(empleadoFamiliares.empleadoId, e.id),
            eq(empleadoFamiliares.guarderiaId, c.gId),
          ),
        )
        .returning({ id: empleadoFamiliares.id });
      if (upd.length === 0) return { error: 'No encontramos ese familiar.' };
    } else {
      await db
        .insert(empleadoFamiliares)
        .values({ ...datos, empleadoId: e.id, guarderiaId: c.gId });
    }
  } catch {
    return { error: 'No se pudo guardar el familiar.' };
  }
  revalidar(e.id);
  return {};
}

export async function eliminarFamiliarAction(
  empleadoId: string,
  familiarId: string,
): Promise<ResultadoLegajo> {
  const r = await conLegajo(empleadoId);
  if ('error' in r) return { error: r.error };
  const { c, e } = r;
  if (!uuid.safeParse(familiarId).success) return { error: 'Dato inválido.' };

  await db
    .delete(empleadoFamiliares)
    .where(
      and(
        eq(empleadoFamiliares.id, familiarId),
        eq(empleadoFamiliares.empleadoId, e.id),
        eq(empleadoFamiliares.guarderiaId, c.gId),
      ),
    );
  revalidar(e.id);
  return {};
}

// ─── Vínculo con un usuario del sistema ─────────────────────────────────────

/**
 * Vincula (o desvincula, con `null`) el legajo con un usuario existente del club. Es solo un
 * reconocimiento: no cambia el acceso ni el rol del usuario, y los datos del legajo siguen
 * siendo del legajo. `copiarDatos` completa el email y el teléfono que estén vacíos, una
 * sola vez (no se sincroniza).
 */
export async function vincularUsuarioAction(
  empleadoId: string,
  profileId: string | null,
  copiarDatos: boolean,
): Promise<ResultadoLegajo> {
  const r = await conLegajo(empleadoId);
  if ('error' in r) return { error: r.error };
  const { c, e } = r;

  if (profileId !== null) {
    if (!uuid.safeParse(profileId).success) return { error: 'Dato inválido.' };
    const err = await validarVinculo(c.gId, profileId, e.id);
    if (err) return { error: err };
  }

  let completar: { email?: string; telefono?: string } = {};
  if (profileId && copiarDatos) {
    const [p] = await db
      .select({ email: profiles.email, telefono: profiles.telefono })
      .from(profiles)
      .where(eq(profiles.id, profileId))
      .limit(1);
    if (!e.email && p?.email) completar = { ...completar, email: p.email };
    if (!e.telefono && p?.telefono) completar = { ...completar, telefono: p.telefono };
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(empleados)
        .set({ profileId, ...completar, updatedBy: c.userId, updatedAt: new Date() })
        .where(and(eq(empleados.id, e.id), eq(empleados.guarderiaId, c.gId)));
      await guardarCambios(tx, c, e.id, [
        {
          campo: 'Usuario del sistema',
          anterior: e.profileId ? 'Vinculado' : null,
          nuevo: profileId ? 'Vinculado' : null,
        },
      ]);
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes('empleados_profile_unico')) {
      return { error: 'Ese usuario ya está vinculado a otro legajo.' };
    }
    return { error: 'No se pudo vincular el usuario.' };
  }
  revalidar(e.id);
  return {};
}
