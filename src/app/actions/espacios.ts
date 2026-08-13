'use server';

import { revalidatePath } from 'next/cache';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  areaMarineros,
  areaOperarios,
  areas,
  embarcaciones,
  espacios,
  lados as ladosTable,
  marinas,
  memberships,
  naves,
  pisos as pisosTable,
  servicios,
  socioServicios,
  socioServiciosCancelados,
} from '@/lib/db/schema';
import { getActiveMarina } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { todayArg } from '@/lib/dates';
import { cerrarContratoAbierto, crearSocioServicio } from '@/lib/socio-servicios';

export type CreateAreaInput = { operarioIds?: string[] } & (
  | {
      tipo: 'marina';
      nombre: string;
      cantidadPeines: number;
      cantidadAmarras: number;
    }
  | {
      tipo: 'nave';
      nombre: string;
      lados: { nombre: string; cantidadPisos: number; cantidadCamas: number }[];
    }
);

// Asigna operarios a un área recién creada (valida que sean operarios activos
// de la guardería). Silencioso ante ids inválidos: solo inserta los válidos.
async function asignarOperariosNuevaArea(
  guarderiaId: string,
  areaId: string,
  operarioIds: string[] | undefined,
): Promise<void> {
  const ids = [...new Set(operarioIds ?? [])];
  if (ids.length === 0) return;
  const validos = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(
      and(
        eq(memberships.guarderiaId, guarderiaId),
        eq(memberships.rol, 'operario'),
        eq(memberships.status, 'active'),
        inArray(memberships.userId, ids),
      ),
    );
  if (validos.length === 0) return;
  await db
    .insert(areaOperarios)
    .values(validos.map((v) => ({ guarderiaId, areaId, operarioId: v.userId })));
}

// Espejo de asignarOperariosNuevaArea, pero para marineros (áreas marina).
async function asignarMarinerosNuevaArea(
  guarderiaId: string,
  areaId: string,
  marineroIds: string[] | undefined,
): Promise<void> {
  const ids = [...new Set(marineroIds ?? [])];
  if (ids.length === 0) return;
  const validos = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(
      and(
        eq(memberships.guarderiaId, guarderiaId),
        eq(memberships.rol, 'marinero'),
        eq(memberships.status, 'active'),
        inArray(memberships.userId, ids),
      ),
    );
  if (validos.length === 0) return;
  await db
    .insert(areaMarineros)
    .values(validos.map((v) => ({ guarderiaId, areaId, marineroId: v.userId })));
}

function isAdmin(ctx: NonNullable<Awaited<ReturnType<typeof getActiveMarina>>>): boolean {
  return (
    ctx.profile.isSuperAdmin ||
    ctx.activeMembership.rol === 'administrador_general' ||
    ctx.activeMembership.rol === 'administrativo'
  );
}

/**
 * Distribuye `total` entre `n` buckets de forma que todos tengan
 * Math.floor(total/n) y el último concentre el sobrante. Requiere n >= 1.
 * Ejemplo: 103 / 4 → [25, 25, 25, 28]
 */
function distribuir(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const resto = total - base * n;
  const arr = new Array(n).fill(base) as number[];
  arr[n - 1] += resto;
  return arr;
}

export async function createAreaAction(
  input: CreateAreaInput,
): Promise<{ error?: string; id?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden crear áreas.' };

  const nombre = input.nombre.trim();
  if (!nombre) return { error: 'El nombre del área es obligatorio.' };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  if (input.tipo === 'marina') {
    if (!Number.isInteger(input.cantidadPeines) || input.cantidadPeines < 1) {
      return { error: 'La cantidad de peines debe ser mayor o igual a 1.' };
    }
    if (!Number.isInteger(input.cantidadAmarras) || input.cantidadAmarras < 0) {
      return { error: 'La cantidad de amarras debe ser mayor o igual a 0.' };
    }

    const [area] = await db
      .insert(areas)
      .values({ guarderiaId, nombre })
      .returning({ id: areas.id });

    const reparto = distribuir(input.cantidadAmarras, input.cantidadPeines);

    for (let i = 0; i < input.cantidadPeines; i++) {
      const [marina] = await db
        .insert(marinas)
        .values({ guarderiaId, areaId: area.id, nombre: `Peine ${i + 1}`, orden: i })
        .returning({ id: marinas.id });

      const cant = reparto[i];
      if (cant <= 0) continue;

      const rows = [];
      for (let j = 1; j <= cant; j++) {
        rows.push({
          guarderiaId,
          areaId: area.id,
          marinaId: marina.id,
          nomenclatura: String(j),
          estado: 'disponible' as const,
        });
      }
      await db.insert(espacios).values(rows);
    }

    // Área marina → se asignan marineros (no operarios).
    await asignarMarinerosNuevaArea(guarderiaId, area.id, input.operarioIds);

    revalidatePath('/espacios');
    return { id: area.id };
  }

  // Nave
  if (!input.lados || input.lados.length === 0) {
    return { error: 'La nave debe tener al menos un lado.' };
  }
  for (const l of input.lados) {
    if (!l.nombre.trim()) return { error: 'El nombre del lado es obligatorio.' };
    if (!Number.isInteger(l.cantidadPisos) || l.cantidadPisos < 1) {
      return { error: `La cantidad de pisos del lado "${l.nombre}" debe ser ≥ 1.` };
    }
    if (!Number.isInteger(l.cantidadCamas) || l.cantidadCamas < 0) {
      return { error: `La cantidad de camas del lado "${l.nombre}" debe ser ≥ 0.` };
    }
  }

  const [area] = await db.insert(areas).values({ guarderiaId, nombre }).returning({ id: areas.id });

  const [nave] = await db
    .insert(naves)
    .values({ guarderiaId, areaId: area.id, nombre, orden: 0 })
    .returning({ id: naves.id });

  for (const l of input.lados) {
    const [lado] = await db
      .insert(ladosTable)
      .values({
        guarderiaId,
        areaId: area.id,
        naveId: nave.id,
        nombre: l.nombre.trim(),
        cantidadPisos: l.cantidadPisos,
        espaciosTotal: l.cantidadCamas,
      })
      .returning({ id: ladosTable.id });

    const reparto = distribuir(l.cantidadCamas, l.cantidadPisos);
    let numeracion = 1;

    for (let i = 0; i < l.cantidadPisos; i++) {
      const [piso] = await db
        .insert(pisosTable)
        .values({
          areaId: area.id,
          ladoId: lado.id,
          nombre: `Piso ${i + 1}`,
          orden: i,
        })
        .returning({ id: pisosTable.id });

      const cant = reparto[i];
      if (cant <= 0) continue;

      const rows = [];
      for (let k = 0; k < cant; k++, numeracion++) {
        rows.push({
          guarderiaId,
          areaId: area.id,
          naveId: nave.id,
          ladoId: lado.id,
          pisoId: piso.id,
          nomenclatura: String(numeracion),
          estado: 'disponible' as const,
        });
      }
      await db.insert(espacios).values(rows);
    }
  }

  await asignarOperariosNuevaArea(guarderiaId, area.id, input.operarioIds);

  revalidatePath('/espacios');
  return { id: area.id };
}

const ESTADOS_ESPACIO = ['disponible', 'ocupado', 'reservado'] as const;
type EstadoEspacio = (typeof ESTADOS_ESPACIO)[number];

export type UpdateEspacioInput = {
  id: string;
  ocupanteId: string | null;
  embarcacionId: string | null;
  nomenclatura: string;
  estado: EstadoEspacio;
  servicioId: string | null;
  eslora: number | null;
  manga: number | null;
  puntual: number | null;
};

export async function updateEspacioAction(input: UpdateEspacioInput): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden editar espacios.' };

  if (!input.nomenclatura.trim()) return { error: 'La nomenclatura es obligatoria.' };
  if (!ESTADOS_ESPACIO.includes(input.estado)) return { error: 'Estado inválido.' };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  const [current] = await db
    .select({
      id: espacios.id,
      ocupanteId: espacios.ocupanteId,
      fechaAsignacion: espacios.fechaAsignacion,
      servicioId: espacios.servicioId,
    })
    .from(espacios)
    .where(and(eq(espacios.id, input.id), eq(espacios.guarderiaId, guarderiaId)))
    .limit(1);
  if (!current) return { error: 'Espacio no encontrado.' };

  // Validar que el ocupante (si se asocia) sea miembro de la guardería.
  // El tilde "Comprobante interno" del socio define el canal del contrato
  // espejo que se crea al asignar (Interno/Fiscal), editable después desde
  // Servicios Contratados.
  let ocupanteTildeInterno = false;
  if (input.ocupanteId) {
    const [m] = await db
      .select({ id: memberships.id, comprobanteInterno: memberships.comprobanteInterno })
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, input.ocupanteId),
          eq(memberships.guarderiaId, guarderiaId),
          eq(memberships.status, 'active'),
        ),
      )
      .limit(1);
    if (!m) return { error: 'El cliente seleccionado no es miembro de esta guardería.' };
    ocupanteTildeInterno = m.comprobanteInterno ?? false;
  }

  // Validar que la embarcación pertenezca al ocupante si se proveen ambos.
  if (input.embarcacionId && input.ocupanteId) {
    const [emb] = await db
      .select({ id: embarcaciones.id })
      .from(embarcaciones)
      .where(
        and(
          eq(embarcaciones.id, input.embarcacionId),
          eq(embarcaciones.profileId, input.ocupanteId),
          eq(embarcaciones.guarderiaId, guarderiaId),
        ),
      )
      .limit(1);
    if (!emb) return { error: 'La embarcación no pertenece al cliente seleccionado.' };
  }

  // Validar que el servicio pertenezca a la guardería.
  let tarifaPrecio: string | null = null;
  let servicioNombre: string | null = null;
  if (input.servicioId) {
    const [s] = await db
      .select({
        id: servicios.id,
        nombre: servicios.nombre,
        precio: servicios.precio,
        alicuotaIva: servicios.alicuotaIva,
        estado: servicios.estado,
        vigenciaDesde: servicios.vigenciaDesde,
        vigenciaHasta: servicios.vigenciaHasta,
      })
      .from(servicios)
      .where(and(eq(servicios.id, input.servicioId), eq(servicios.guarderiaId, guarderiaId)))
      .limit(1);
    if (!s) return { error: 'La tarifa seleccionada no existe.' };
    // Solo exigimos que esté activa y vigente si es una tarifa NUEVA para
    // este espacio; si ya la tenía asignada y se pausó/inactivó/venció
    // después, dejamos que se sigan editando otros campos del espacio sin
    // bloquear por esto (la deuda ya generada se sigue pudiendo facturar).
    if (input.servicioId !== current.servicioId) {
      if (s.estado !== 'activo') {
        return { error: 'La tarifa seleccionada no está activa.' };
      }
      const hoyStr = new Date().toISOString().slice(0, 10);
      if (s.vigenciaDesde > hoyStr || s.vigenciaHasta < hoyStr) {
        return { error: 'La tarifa seleccionada no está vigente.' };
      }
    }
    tarifaPrecio = s.precio ?? null;
    servicioNombre = s.nombre;
  }

  // Día de cobro mensual: arranca cuando se asigna o se cambia el ocupante.
  // Si el ocupante no cambió, conservamos el valor previo. Si pasa a null
  // (espacio liberado), también limpiamos la fecha.
  const ocupanteCambio = current.ocupanteId !== input.ocupanteId;
  const servicioCambio = current.servicioId !== input.servicioId;
  let nuevaFechaAsignacion: Date | null;
  if (input.ocupanteId === null) {
    nuevaFechaAsignacion = null;
  } else if (ocupanteCambio) {
    nuevaFechaAsignacion = new Date();
  } else {
    nuevaFechaAsignacion = current.fechaAsignacion;
  }

  // "Ocupado" sin ocupante no tiene sentido (y deja el espacio invisible
  // para reasignar, aunque ya dejó de facturarse). Si se saca el cliente y
  // queda en ese estado, bajarlo a "disponible". "Reservado" sí se respeta:
  // puede usarse para guardarle el lugar a alguien antes de asignarlo.
  const nuevoEstado =
    input.ocupanteId === null && input.estado === 'ocupado' ? 'disponible' : input.estado;

  await db
    .update(espacios)
    .set({
      ocupanteId: input.ocupanteId,
      servicioId: input.servicioId,
      nomenclatura: input.nomenclatura.trim(),
      estado: nuevoEstado,
      eslora: input.eslora != null ? input.eslora.toFixed(2) : null,
      manga: input.manga != null ? input.manga.toFixed(2) : null,
      puntual: input.puntual != null ? input.puntual.toFixed(2) : null,
      tarifa: tarifaPrecio,
      fechaAsignacion: nuevaFechaAsignacion,
    })
    .where(eq(espacios.id, input.id));

  // Actualizar la embarcación asignada a este espacio: primero desvinculamos
  // cualquier embarcación que estuviera en él, luego vinculamos la nueva.
  await db
    .update(embarcaciones)
    .set({ espacioId: null, updatedAt: new Date() })
    .where(and(eq(embarcaciones.espacioId, input.id), eq(embarcaciones.guarderiaId, guarderiaId)));
  if (input.embarcacionId) {
    await db
      .update(embarcaciones)
      .set({ espacioId: input.id, updatedAt: new Date() })
      .where(
        and(eq(embarcaciones.id, input.embarcacionId), eq(embarcaciones.guarderiaId, guarderiaId)),
      );
  }

  // Si el espacio queda liberado, o si cambió de ocupante/servicio, el
  // contrato anterior (si había uno) terminó acá — cerrarlo en el registro
  // de Servicios Contratados. No hace falta tocar `socioServiciosCancelados`:
  // la facturación de espacios ya se frena porque el cron exige
  // `ocupanteId IS NOT NULL`.
  if (current.ocupanteId && current.servicioId && (ocupanteCambio || servicioCambio)) {
    await cerrarContratoAbierto({
      socioId: current.ocupanteId,
      servicioId: current.servicioId,
      espacioId: input.id,
    });
  }

  // Si hay ocupante + servicio, dejamos el contrato al día. Modelo "los
  // cargos nacen al emitir": acá NO se crea ningún movimiento en cuenta
  // corriente — el proporcional del mes (con base en la fecha de asignación)
  // lo computa listarPendientesFacturar y se cobra al emitir el próximo
  // comprobante (manual o automático).
  if (input.ocupanteId && input.servicioId && servicioNombre) {
    try {
      // Re-contratar: si el servicio estaba cancelado para este socio, limpiar
      // la cancelación para que vuelva a computarse como pendiente.
      await db
        .delete(socioServiciosCancelados)
        .where(
          and(
            eq(socioServiciosCancelados.socioId, input.ocupanteId),
            eq(socioServiciosCancelados.servicioId, input.servicioId),
          ),
        );
      // Solo abrimos un contrato nuevo si algo cambió: si el ocupante y el
      // servicio son los mismos que antes, ya existe una fila vigente y no
      // hay que duplicarla.
      if (ocupanteCambio || servicioCambio) {
        await db.transaction((tx) =>
          crearSocioServicio(tx, {
            guarderiaId,
            socioId: input.ocupanteId!,
            servicioId: input.servicioId!,
            espacioId: input.id,
            fechaInicio: todayArg(),
            comprobanteInterno: ocupanteTildeInterno,
            createdBy: ctx.profile.id,
          }),
        );
      }
    } catch (err) {
      // No bloqueamos el save del espacio si falla el registro del contrato.
      console.error('[updateEspacioAction contrato] error', err);
    }
  }

  revalidatePath('/espacios');
  return {};
}

/**
 * Asigna un espacio disponible a un socio (asignación inicial — el socio
 * no tenía espacio antes). Setea ocupante, estado=ocupado y fechaAsignacion.
 * Asocia la embarcación del socio (si existe) al espacio. Crea el
 * movimiento mensual proporcional con la tarifa del espacio. Si el espacio
 * no tiene tarifa configurada, rechaza.
 */
export async function assignEspacioToSocioAction(input: {
  socioId: string;
  espacioId: string;
  embarcacionId?: string;
}): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden asignar espacios.' };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  const [socio] = await db
    .select({ id: memberships.id, comprobanteInterno: memberships.comprobanteInterno })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, input.socioId),
        eq(memberships.guarderiaId, guarderiaId),
        eq(memberships.status, 'active'),
      ),
    )
    .limit(1);
  if (!socio) return { error: 'El socio no es miembro de esta guardería.' };
  const socioTildeInterno = socio.comprobanteInterno ?? false;

  const [espacio] = await db
    .select({
      id: espacios.id,
      ocupanteId: espacios.ocupanteId,
      estado: espacios.estado,
      servicioId: espacios.servicioId,
    })
    .from(espacios)
    .where(and(eq(espacios.id, input.espacioId), eq(espacios.guarderiaId, guarderiaId)))
    .limit(1);
  if (!espacio) return { error: 'Espacio no encontrado.' };
  if (espacio.ocupanteId || espacio.estado === 'ocupado') {
    return { error: 'El espacio ya está ocupado.' };
  }

  await db
    .update(espacios)
    .set({
      ocupanteId: input.socioId,
      estado: 'ocupado',
      fechaAsignacion: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(espacios.id, input.espacioId));

  // Asociar embarcación al espacio: si viene explícita, usarla; si no,
  // auto-asignar solo cuando el socio tiene exactamente una embarcación
  // sin espacio (caso frecuente: un barco, asignación inicial).
  if (input.embarcacionId) {
    await db
      .update(embarcaciones)
      .set({ espacioId: input.espacioId, updatedAt: new Date() })
      .where(
        and(eq(embarcaciones.id, input.embarcacionId), eq(embarcaciones.guarderiaId, guarderiaId)),
      );
  } else {
    const barcosDelSocio = await db
      .select({ id: embarcaciones.id, espacioId: embarcaciones.espacioId })
      .from(embarcaciones)
      .where(
        and(eq(embarcaciones.profileId, input.socioId), eq(embarcaciones.guarderiaId, guarderiaId)),
      );
    const sinEspacio = barcosDelSocio.filter((b) => !b.espacioId);
    if (sinEspacio.length === 1) {
      await db
        .update(embarcaciones)
        .set({ espacioId: input.espacioId, updatedAt: new Date() })
        .where(eq(embarcaciones.id, sinEspacio[0].id));
    }
  }

  // Si el espacio tiene tarifa ACTIVA y vigente, registramos el contrato en
  // Servicios Contratados. Modelo "los cargos nacen al emitir": acá NO se
  // crea ningún movimiento en cuenta corriente — el proporcional del mes lo
  // computa listarPendientesFacturar y se cobra al emitir el próximo
  // comprobante (manual o automático). Si la tarifa está pausada/inactiva,
  // se asigna el espacio igual y el pendiente aparece cuando la tarifa
  // vuelva a estar activa.
  if (espacio.servicioId) {
    try {
      const [servicio] = await db
        .select({
          estado: servicios.estado,
          vigenciaDesde: servicios.vigenciaDesde,
          vigenciaHasta: servicios.vigenciaHasta,
        })
        .from(servicios)
        .where(eq(servicios.id, espacio.servicioId))
        .limit(1);
      const hoyStr = new Date().toISOString().slice(0, 10);
      const vigente =
        !!servicio && servicio.vigenciaDesde <= hoyStr && servicio.vigenciaHasta >= hoyStr;
      if (servicio && servicio.estado === 'activo' && vigente) {
        // Re-contratar: limpiar la cancelación previa de este (socio, servicio).
        await db
          .delete(socioServiciosCancelados)
          .where(
            and(
              eq(socioServiciosCancelados.socioId, input.socioId),
              eq(socioServiciosCancelados.servicioId, espacio.servicioId),
            ),
          );
        await db.transaction((tx) =>
          crearSocioServicio(tx, {
            guarderiaId,
            socioId: input.socioId,
            servicioId: espacio.servicioId!,
            espacioId: input.espacioId,
            fechaInicio: todayArg(),
            comprobanteInterno: socioTildeInterno,
            createdBy: ctx.profile.id,
          }),
        );
      }
    } catch (err) {
      console.error('[assignEspacioToSocioAction] contrato error', err);
    }
  }

  revalidatePath('/espacios');
  revalidatePath(`/usuarios/${input.socioId}`);
  return {};
}

/**
 * Mueve el ocupante (y sus embarcaciones en este espacio) de un espacio
 * "origen" a un espacio "destino" disponible. Preserva la fechaAsignacion
 * del origen para no romper el día de cobro mensual del socio; la tarifa
 * del destino se mantiene como esté configurada (próximo ciclo cobra con
 * esa tarifa). No toca movimientos ya emitidos.
 */
export async function moveOcupanteAction(input: {
  origenId: string;
  destinoId: string;
  // Fallback de autocorrección: si el origen quedó con ocupanteId
  // desincronizado de embarcaciones.espacioId (ej. una limpieza de datos que
  // liberó el espacio sin desvincular la embarcación), en vez de fallar se
  // asigna directo al destino usando estos datos. Los pasa siempre
  // EspacioEmbarcacionRow — no cambia nada cuando el origen sí tiene ocupante.
  socioId?: string;
  embarcacionId?: string;
}): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden cambiar la ubicación.' };
  if (input.origenId === input.destinoId) {
    return { error: 'El espacio destino debe ser distinto al de origen.' };
  }

  const guarderiaId = ctx.activeMembership.guarderiaId;

  const [origen] = await db
    .select({
      id: espacios.id,
      ocupanteId: espacios.ocupanteId,
      fechaAsignacion: espacios.fechaAsignacion,
      servicioId: espacios.servicioId,
    })
    .from(espacios)
    .where(and(eq(espacios.id, input.origenId), eq(espacios.guarderiaId, guarderiaId)))
    .limit(1);
  if (!origen) return { error: 'Espacio origen no encontrado.' };
  if (!origen.ocupanteId) {
    if (input.socioId) {
      return assignEspacioToSocioAction({
        socioId: input.socioId,
        espacioId: input.destinoId,
        embarcacionId: input.embarcacionId,
      });
    }
    return { error: 'El espacio origen no tiene cliente asignado.' };
  }

  const [destino] = await db
    .select({
      id: espacios.id,
      ocupanteId: espacios.ocupanteId,
      estado: espacios.estado,
      eslora: espacios.eslora,
      servicioId: espacios.servicioId,
      unidadMetraje: servicios.unidadMetraje,
    })
    .from(espacios)
    .leftJoin(servicios, eq(servicios.id, espacios.servicioId))
    .where(and(eq(espacios.id, input.destinoId), eq(espacios.guarderiaId, guarderiaId)))
    .limit(1);
  if (!destino) return { error: 'Espacio destino no encontrado.' };
  if (destino.ocupanteId || destino.estado === 'ocupado') {
    return { error: 'El espacio destino debe estar disponible.' };
  }

  // El barco no puede ser más grande que el espacio destino. Las
  // embarcaciones siempre se guardan en metros (eslora_m); el espacio
  // puede tener su eslora en metros o pies según la unidad de la tarifa
  // asociada. Si el destino no tiene eslora cargada, no se valida (no
  // tenemos base de comparación).
  if (destino.eslora != null) {
    const barcos = await db
      .select({ esloraM: embarcaciones.esloraM })
      .from(embarcaciones)
      .where(
        and(
          eq(embarcaciones.profileId, origen.ocupanteId),
          eq(embarcaciones.guarderiaId, guarderiaId),
        ),
      );
    const esloraMaxM = barcos.reduce((max, b) => {
      const v = b.esloraM != null ? Number(b.esloraM) : 0;
      return v > max ? v : max;
    }, 0);
    if (esloraMaxM > 0) {
      const esloraDestinoNum = Number(destino.eslora);
      const esloraDestinoM =
        destino.unidadMetraje === 'pies' ? esloraDestinoNum * 0.3048 : esloraDestinoNum;
      // Margen de 1 cm para tolerar redondeos al convertir pies→metros.
      if (esloraMaxM > esloraDestinoM + 0.01) {
        return {
          error: `El barco (${esloraMaxM.toFixed(2)} m) no entra en el espacio destino (${esloraDestinoM.toFixed(2)} m).`,
        };
      }
    }
  }

  await db
    .update(espacios)
    .set({
      ocupanteId: origen.ocupanteId,
      fechaAsignacion: origen.fechaAsignacion,
      estado: 'ocupado',
      updatedAt: new Date(),
    })
    .where(eq(espacios.id, input.destinoId));

  await db
    .update(espacios)
    .set({
      ocupanteId: null,
      fechaAsignacion: null,
      estado: 'disponible',
      updatedAt: new Date(),
    })
    .where(eq(espacios.id, input.origenId));

  await db
    .update(embarcaciones)
    .set({ espacioId: input.destinoId, updatedAt: new Date() })
    .where(
      and(
        eq(embarcaciones.guarderiaId, guarderiaId),
        eq(embarcaciones.espacioId, input.origenId),
        eq(embarcaciones.profileId, origen.ocupanteId),
      ),
    );

  // El contrato sigue el movimiento: si el destino tiene la misma tarifa,
  // es el mismo contrato y solo cambia de espacio físico (mismo número de
  // operación, sin tocar fechas). Si la tarifa es distinta (o el destino no
  // tiene tarifa configurada), el contrato del origen termina acá y, si
  // corresponde, arranca uno nuevo para la tarifa del destino.
  if (origen.servicioId) {
    if (origen.servicioId === destino.servicioId) {
      await db
        .update(socioServicios)
        .set({ espacioId: input.destinoId, updatedAt: new Date() })
        .where(
          and(
            eq(socioServicios.socioId, origen.ocupanteId),
            eq(socioServicios.servicioId, origen.servicioId),
            eq(socioServicios.espacioId, input.origenId),
            isNull(socioServicios.fechaBaja),
          ),
        );
    } else {
      await cerrarContratoAbierto({
        socioId: origen.ocupanteId,
        servicioId: origen.servicioId,
        espacioId: input.origenId,
      });
      if (destino.servicioId) {
        await db.transaction((tx) =>
          crearSocioServicio(tx, {
            guarderiaId,
            socioId: origen.ocupanteId!,
            servicioId: destino.servicioId!,
            espacioId: input.destinoId,
            fechaInicio: todayArg(),
            createdBy: ctx.profile.id,
          }),
        );
      }
    }
  }

  revalidatePath('/espacios');
  revalidatePath(`/usuarios/${origen.ocupanteId}`);
  return {};
}

export async function deleteEspacioAction(id: string): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden eliminar espacios.' };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  const [current] = await db
    .select({ id: espacios.id })
    .from(espacios)
    .where(and(eq(espacios.id, id), eq(espacios.guarderiaId, guarderiaId)))
    .limit(1);
  if (!current) return { error: 'Espacio no encontrado.' };

  await db.delete(espacios).where(eq(espacios.id, id));
  revalidatePath('/espacios');
  return {};
}

export async function deleteAreaAction(id: string): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden eliminar áreas.' };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  const [area] = await db
    .select({ id: areas.id })
    .from(areas)
    .where(and(eq(areas.id, id), eq(areas.guarderiaId, guarderiaId)))
    .limit(1);
  if (!area) return { error: 'Área no encontrada.' };

  // Cascade manual: espacios → pisos → lados → naves → marinas → area.
  await db.delete(espacios).where(eq(espacios.areaId, id));

  const ladosArea = await db
    .select({ id: ladosTable.id })
    .from(ladosTable)
    .where(eq(ladosTable.areaId, id));
  const ladoIds = ladosArea.map((l) => l.id);
  if (ladoIds.length > 0) {
    await db.delete(pisosTable).where(inArray(pisosTable.ladoId, ladoIds));
    await db.delete(ladosTable).where(inArray(ladosTable.id, ladoIds));
  }

  await db.delete(naves).where(eq(naves.areaId, id));
  await db.delete(marinas).where(eq(marinas.areaId, id));
  await db.delete(areas).where(eq(areas.id, id));

  revalidatePath('/espacios');
  return {};
}

/**
 * Reemplaza la lista de operarios asignados a un área. Los operarios de un área
 * son los que ven (y pueden tomar) las tareas de esa área.
 */
export async function setAreaOperariosAction(
  areaId: string,
  operarioIds: string[],
): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden asignar operarios.' };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  const [area] = await db
    .select({ id: areas.id })
    .from(areas)
    .where(and(eq(areas.id, areaId), eq(areas.guarderiaId, guarderiaId)))
    .limit(1);
  if (!area) return { error: 'Área no encontrada.' };

  // Validar que todos sean operarios activos de esta guardería.
  const ids = [...new Set(operarioIds)];
  if (ids.length > 0) {
    const validos = await db
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(
        and(
          eq(memberships.guarderiaId, guarderiaId),
          eq(memberships.rol, 'operario'),
          eq(memberships.status, 'active'),
          inArray(memberships.userId, ids),
        ),
      );
    if (validos.length !== ids.length) {
      return { error: 'Alguno de los operarios no pertenece a esta guardería.' };
    }
  }

  // Reemplazo completo: borrar las asignaciones actuales e insertar las nuevas.
  await db.delete(areaOperarios).where(eq(areaOperarios.areaId, areaId));
  if (ids.length > 0) {
    await db
      .insert(areaOperarios)
      .values(ids.map((operarioId) => ({ guarderiaId, areaId, operarioId })));
  }

  revalidatePath('/espacios');
  revalidatePath('/tareas');
  return {};
}

/**
 * Reemplaza la lista de marineros asignados a un área (marina). Espejo de
 * setAreaOperariosAction. Los marineros de un área ven (y toman) las tareas de
 * marina de esa área.
 */
export async function setAreaMarinerosAction(
  areaId: string,
  marineroIds: string[],
): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden asignar marineros.' };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  const [area] = await db
    .select({ id: areas.id })
    .from(areas)
    .where(and(eq(areas.id, areaId), eq(areas.guarderiaId, guarderiaId)))
    .limit(1);
  if (!area) return { error: 'Área no encontrada.' };

  // Validar que todos sean marineros activos de esta guardería.
  const ids = [...new Set(marineroIds)];
  if (ids.length > 0) {
    const validos = await db
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(
        and(
          eq(memberships.guarderiaId, guarderiaId),
          eq(memberships.rol, 'marinero'),
          eq(memberships.status, 'active'),
          inArray(memberships.userId, ids),
        ),
      );
    if (validos.length !== ids.length) {
      return { error: 'Alguno de los marineros no pertenece a esta guardería.' };
    }
  }

  // Reemplazo completo.
  await db.delete(areaMarineros).where(eq(areaMarineros.areaId, areaId));
  if (ids.length > 0) {
    await db
      .insert(areaMarineros)
      .values(ids.map((marineroId) => ({ guarderiaId, areaId, marineroId })));
  }

  revalidatePath('/espacios');
  revalidatePath('/tareas');
  return {};
}

/**
 * Devuelve el próximo número disponible (max+1) parseando las nomenclaturas
 * existentes como enteros. Si ninguna parsea o no hay espacios, devuelve 1.
 */
function nextNomenclatura(existentes: { nomenclatura: string | null }[]): string {
  let max = 0;
  for (const e of existentes) {
    const n = parseInt(e.nomenclatura ?? '', 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return String(max + 1);
}

export async function addEspacioToMarinaAction(
  marinaId: string,
): Promise<{ error?: string; id?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden agregar espacios.' };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  const [m] = await db
    .select({ id: marinas.id, areaId: marinas.areaId })
    .from(marinas)
    .where(and(eq(marinas.id, marinaId), eq(marinas.guarderiaId, guarderiaId)))
    .limit(1);
  if (!m) return { error: 'Peine no encontrado.' };

  const existentes = await db
    .select({ nomenclatura: espacios.nomenclatura })
    .from(espacios)
    .where(eq(espacios.marinaId, marinaId));

  const [row] = await db
    .insert(espacios)
    .values({
      guarderiaId,
      areaId: m.areaId,
      marinaId,
      nomenclatura: nextNomenclatura(existentes),
      estado: 'disponible',
    })
    .returning({ id: espacios.id });

  revalidatePath('/espacios');
  return { id: row.id };
}

export async function addEspacioToPisoAction(
  pisoId: string,
): Promise<{ error?: string; id?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden agregar espacios.' };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  // pisos no tiene guarderia_id, validamos via lado.
  const [p] = await db
    .select({
      id: pisosTable.id,
      areaId: pisosTable.areaId,
      ladoId: pisosTable.ladoId,
      naveId: ladosTable.naveId,
    })
    .from(pisosTable)
    .innerJoin(ladosTable, eq(ladosTable.id, pisosTable.ladoId))
    .where(and(eq(pisosTable.id, pisoId), eq(ladosTable.guarderiaId, guarderiaId)))
    .limit(1);
  if (!p) return { error: 'Piso no encontrado.' };

  // La numeración en una nave es por lado (no por piso), para que no
  // colisione con otros pisos del mismo lado.
  const existentesLado = p.ladoId
    ? await db
        .select({ nomenclatura: espacios.nomenclatura })
        .from(espacios)
        .where(eq(espacios.ladoId, p.ladoId))
    : [];

  const [row] = await db
    .insert(espacios)
    .values({
      guarderiaId,
      areaId: p.areaId,
      naveId: p.naveId,
      ladoId: p.ladoId,
      pisoId,
      nomenclatura: nextNomenclatura(existentesLado),
      estado: 'disponible',
    })
    .returning({ id: espacios.id });

  revalidatePath('/espacios');
  return { id: row.id };
}

export async function deletePeineAction(marinaId: string): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden eliminar peines.' };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  const [m] = await db
    .select({ id: marinas.id })
    .from(marinas)
    .where(and(eq(marinas.id, marinaId), eq(marinas.guarderiaId, guarderiaId)))
    .limit(1);
  if (!m) return { error: 'Peine no encontrado.' };

  await db.delete(espacios).where(eq(espacios.marinaId, marinaId));
  await db.delete(marinas).where(eq(marinas.id, marinaId));

  revalidatePath('/espacios');
  return {};
}

export async function deletePisoAction(pisoId: string): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden eliminar pisos.' };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  // pisos no tiene guarderia_id, validamos via lado.
  const [p] = await db
    .select({ id: pisosTable.id })
    .from(pisosTable)
    .innerJoin(ladosTable, eq(ladosTable.id, pisosTable.ladoId))
    .where(and(eq(pisosTable.id, pisoId), eq(ladosTable.guarderiaId, guarderiaId)))
    .limit(1);
  if (!p) return { error: 'Piso no encontrado.' };

  await db.delete(espacios).where(eq(espacios.pisoId, pisoId));
  await db.delete(pisosTable).where(eq(pisosTable.id, pisoId));

  revalidatePath('/espacios');
  return {};
}

export async function addPisoAction(ladoId: string): Promise<{ error?: string; pisoId?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden agregar pisos.' };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  const [lado] = await db
    .select({ id: ladosTable.id, areaId: ladosTable.areaId, naveId: ladosTable.naveId })
    .from(ladosTable)
    .where(and(eq(ladosTable.id, ladoId), eq(ladosTable.guarderiaId, guarderiaId)))
    .limit(1);
  if (!lado) return { error: 'Lado no encontrado.' };

  const pisosLado = await db
    .select({ id: pisosTable.id, orden: pisosTable.orden })
    .from(pisosTable)
    .where(eq(pisosTable.ladoId, ladoId))
    .orderBy(desc(pisosTable.orden));
  if (pisosLado.length === 0) {
    return { error: 'El lado no tiene pisos previos para usar como referencia.' };
  }

  const ultimoPiso = pisosLado[0];
  const nuevoOrden = (ultimoPiso.orden ?? 0) + 1;

  const espaciosUltimoPiso = await db
    .select({ id: espacios.id })
    .from(espacios)
    .where(eq(espacios.pisoId, ultimoPiso.id));
  const cantEspacios = espaciosUltimoPiso.length;

  // Continuar la secuencia numérica del lado para no colisionar con nomenclaturas existentes.
  const espaciosLado = await db
    .select({ nomenclatura: espacios.nomenclatura })
    .from(espacios)
    .where(eq(espacios.ladoId, ladoId));
  const maxNum = espaciosLado.reduce((acc, e) => {
    const n = Number(e.nomenclatura);
    return Number.isFinite(n) && n > acc ? n : acc;
  }, 0);

  const [piso] = await db
    .insert(pisosTable)
    .values({
      areaId: lado.areaId,
      ladoId: lado.id,
      nombre: `Piso ${pisosLado.length + 1}`,
      orden: nuevoOrden,
    })
    .returning({ id: pisosTable.id });

  if (cantEspacios > 0) {
    const rows = [];
    for (let k = 0; k < cantEspacios; k++) {
      rows.push({
        guarderiaId,
        areaId: lado.areaId,
        naveId: lado.naveId,
        ladoId: lado.id,
        pisoId: piso.id,
        nomenclatura: String(maxNum + 1 + k),
        estado: 'disponible' as const,
      });
    }
    await db.insert(espacios).values(rows);
  }

  revalidatePath('/espacios');
  return { pisoId: piso.id };
}

export async function moveEspacioToPisoAction(
  espacioId: string,
  targetPisoId: string,
): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden mover espacios.' };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  const [espacio] = await db
    .select({
      id: espacios.id,
      pisoId: espacios.pisoId,
      marinaId: espacios.marinaId,
    })
    .from(espacios)
    .where(and(eq(espacios.id, espacioId), eq(espacios.guarderiaId, guarderiaId)))
    .limit(1);
  if (!espacio) return { error: 'Espacio no encontrado.' };

  if (espacio.pisoId === targetPisoId) return {};
  if (espacio.marinaId) {
    return { error: 'No se puede mover un espacio de marina a un piso de nave.' };
  }

  // Resolver toda la jerarquía del piso destino (lado → nave → área)
  // para mantener los FK del espacio consistentes después del move.
  const [destino] = await db
    .select({
      pisoId: pisosTable.id,
      ladoId: ladosTable.id,
      naveId: ladosTable.naveId,
      areaId: ladosTable.areaId,
    })
    .from(pisosTable)
    .innerJoin(ladosTable, eq(ladosTable.id, pisosTable.ladoId))
    .where(and(eq(pisosTable.id, targetPisoId), eq(ladosTable.guarderiaId, guarderiaId)))
    .limit(1);
  if (!destino) return { error: 'Piso destino no encontrado.' };

  await db
    .update(espacios)
    .set({
      pisoId: destino.pisoId,
      ladoId: destino.ladoId,
      naveId: destino.naveId,
      areaId: destino.areaId,
      updatedAt: new Date(),
    })
    .where(eq(espacios.id, espacioId));

  revalidatePath('/espacios');
  return {};
}

export async function moveEspacioToMarinaAction(
  espacioId: string,
  targetMarinaId: string,
): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden mover espacios.' };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  const [espacio] = await db
    .select({
      id: espacios.id,
      marinaId: espacios.marinaId,
      pisoId: espacios.pisoId,
    })
    .from(espacios)
    .where(and(eq(espacios.id, espacioId), eq(espacios.guarderiaId, guarderiaId)))
    .limit(1);
  if (!espacio) return { error: 'Espacio no encontrado.' };

  if (espacio.marinaId === targetMarinaId) return {};
  if (espacio.pisoId) {
    return { error: 'No se puede mover un espacio de nave a un peine de marina.' };
  }

  const [destino] = await db
    .select({ marinaId: marinas.id, areaId: marinas.areaId })
    .from(marinas)
    .where(and(eq(marinas.id, targetMarinaId), eq(marinas.guarderiaId, guarderiaId)))
    .limit(1);
  if (!destino) return { error: 'Peine destino no encontrado.' };

  await db
    .update(espacios)
    .set({
      marinaId: destino.marinaId,
      areaId: destino.areaId,
      updatedAt: new Date(),
    })
    .where(eq(espacios.id, espacioId));

  revalidatePath('/espacios');
  return {};
}

// Reordena espacios dentro del mismo piso (nave) o peine (marina).
// Setea espacios.offset = índice del array. La query del page ordena por
// offset asc, así que el orden del array refleja exactamente lo que se ve.
// Valida que todos los ids pertenezcan a la guardería activa.
export async function reorderEspaciosAction(espacioIds: string[]): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden reordenar espacios.' };

  if (espacioIds.length === 0) return {};

  const guarderiaId = ctx.activeMembership.guarderiaId;

  // Validar pertenencia a la guardería en una sola query.
  const found = await db
    .select({ id: espacios.id })
    .from(espacios)
    .where(and(eq(espacios.guarderiaId, guarderiaId), inArray(espacios.id, espacioIds)));
  if (found.length !== espacioIds.length) {
    return { error: 'Alguno de los espacios no pertenece a esta guardería.' };
  }

  try {
    // Usamos Supabase client (service_role). En el camino de debug probamos
    // con Drizzle y daba problemas raros (sin error pero sin persistir).
    // Con el client REST de Supabase funciona consistente.
    const admin = createAdminClient();
    for (let i = 0; i < espacioIds.length; i++) {
      const { error: supaErr } = await admin
        .from('espacios')
        .update({ orden: i, updated_at: new Date().toISOString() })
        .eq('id', espacioIds[i])
        .eq('guarderia_id', guarderiaId);
      if (supaErr) {
        return { error: `Error al reordenar: ${supaErr.message}` };
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `Error al reordenar: ${msg}` };
  }

  revalidatePath('/espacios');
  return {};
}
