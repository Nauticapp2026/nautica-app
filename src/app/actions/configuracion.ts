'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, gt } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  guarderiaCentrosEmisores,
  guarderias,
  horariosDia,
  memberships,
  profiles,
  servicios,
} from '@/lib/db/schema';
import { getActiveMarina } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { translateInviteError } from '@/lib/auth/errors';
import { geocodeAddress } from '@/lib/geocoding';
import { recordPlanChange } from '@/lib/pricing/plan-historial';
import {
  administrarPuntoVenta,
  solicitarCertificadoEnlace,
  toTusFecha,
} from '@/lib/tusfacturas/client';
import { CONDICION_IVA_API } from '@/lib/tusfacturas/mappers';
import { MEDIO_PAGO_VALUES } from '@/lib/medios-pago';
import { esPeriodoAnulacion } from '@/lib/periodo-anulacion';

const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'] as const;
type Dia = (typeof DIAS)[number];

const TIPOS = [
  'club_nautico',
  'marina_privada',
  'guarderia_nautica',
  'puerto_deportivo',
  'otro',
] as const;
type Tipo = (typeof TIPOS)[number];

export type HorarioInput = {
  dia: Dia;
  horarios: string | null;
  cerrado: boolean;
};

export type UpdateGuarderiaGeneralData = {
  nombre: string;
  tipo: Tipo;
  direccion: string;
  ciudad: string;
  provincia: string;
  codigoPostal: string;
  telefono: string;
  email: string;
  horarios: HorarioInput[];
  imagenes: string[];
  diaFacturacion: number;
  facturacionPrimerHabil: boolean;
};

function isAdmin(ctx: NonNullable<Awaited<ReturnType<typeof getActiveMarina>>>): boolean {
  return (
    ctx.profile.isSuperAdmin ||
    ctx.activeMembership.rol === 'administrador_general' ||
    ctx.activeMembership.rol === 'administrativo'
  );
}

export async function updateGuarderiaGeneralAction(
  data: UpdateGuarderiaGeneralData,
): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden editar la configuración.' };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  const nombre = data.nombre.trim();
  if (!nombre) return { error: 'El nombre es obligatorio.' };
  if (!TIPOS.includes(data.tipo)) return { error: 'Tipo de establecimiento inválido.' };
  if (
    !data.facturacionPrimerHabil &&
    (!Number.isInteger(data.diaFacturacion) || data.diaFacturacion < 1 || data.diaFacturacion > 28)
  ) {
    return { error: 'El día de facturación debe ser un entero entre 1 y 28.' };
  }

  // Geocoding automático (Nominatim) — convierte direccion+ciudad+provincia
  // en lat/long que la app móvil usa para Clima/mapa de viento. Si falla,
  // dejamos las coordenadas anteriores intactas.
  const coords = await geocodeAddress({
    direccion: data.direccion.trim(),
    ciudad: data.ciudad.trim(),
    provincia: data.provincia.trim(),
  });

  await db
    .update(guarderias)
    .set({
      nombre,
      tipo: data.tipo,
      direccion: data.direccion.trim(),
      ciudad: data.ciudad.trim(),
      provincia: data.provincia.trim(),
      codigoPostal: data.codigoPostal.trim(),
      telefono: data.telefono.trim(),
      email: data.email.trim(),
      imagenes: data.imagenes,
      diaFacturacion: data.diaFacturacion,
      facturacionPrimerHabil: data.facturacionPrimerHabil,
      ...(coords
        ? {
            latitud: coords.lat.toFixed(6),
            longitud: coords.lng.toFixed(6),
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(guarderias.id, guarderiaId));

  for (let i = 0; i < data.horarios.length; i++) {
    const h = data.horarios[i];
    if (!DIAS.includes(h.dia)) continue;

    const existing = await db
      .select({ id: horariosDia.id })
      .from(horariosDia)
      .where(and(eq(horariosDia.guarderiaId, guarderiaId), eq(horariosDia.dia, h.dia)))
      .limit(1);

    const payload = {
      guarderiaId,
      dia: h.dia,
      horarios: h.cerrado ? null : (h.horarios ?? null),
      cerrado: h.cerrado,
      orden: i,
    };

    if (existing.length === 0) {
      await db.insert(horariosDia).values(payload);
    } else {
      await db
        .update(horariosDia)
        .set({ horarios: payload.horarios, cerrado: payload.cerrado, orden: payload.orden })
        .where(eq(horariosDia.id, existing[0].id));
    }
  }

  revalidatePath('/configuracion');
  return {};
}

// =============================================================================
// FEATURE FLAGS / NOTIFICACIONES
// =============================================================================

export type GuarderiaFeatures = {
  activarNotificaciones: boolean;
  activarClimaYMareas: boolean;
  activarReservasOnline: boolean;
  activarPagosOnline: boolean;
  activarMenuGastronomico: boolean;
};

export async function updateGuarderiaFeaturesAction(
  features: GuarderiaFeatures,
): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden editar la configuración.' };

  await db
    .update(guarderias)
    .set({
      activarNotificaciones: features.activarNotificaciones,
      activarClimaYMareas: features.activarClimaYMareas,
      activarReservasOnline: features.activarReservasOnline,
      activarPagosOnline: features.activarPagosOnline,
      activarMenuGastronomico: features.activarMenuGastronomico,
      updatedAt: new Date(),
    })
    .where(eq(guarderias.id, ctx.activeMembership.guarderiaId));

  revalidatePath('/configuracion');
  return {};
}

// =============================================================================
// PUNTO DE VENTA / TUSFACTURAS
// =============================================================================

const CONDICIONES_IVA = [
  'consumidor_final',
  'responsable_inscripto',
  'monotributo',
  'exento',
  'cliente_exterior',
  'iva_no_alcanzado',
] as const;
type CondicionIva = (typeof CONDICIONES_IVA)[number];

const CONDICIONES_IIBB = [
  'convenio_multilateral',
  'local',
  'exento',
  'no_gravado',
  'no_corresponde',
] as const;
type CondicionIibb = (typeof CONDICIONES_IIBB)[number];

const CONDICION_IIBB_LABEL: Record<CondicionIibb, string> = {
  convenio_multilateral: 'Convenio Multilateral',
  local: 'Local',
  exento: 'Exento',
  no_gravado: 'No Gravado',
  no_corresponde: 'No corresponde',
};

/**
 * Construye la URL del webhook de tusfacturas para este deployment.
 * - Devuelve undefined si falta TUSFACTURAS_WEBHOOK_SECRET o NEXT_PUBLIC_APP_URL.
 * - tusfacturas exige HTTPS, así que en dev (http://localhost) no se setea.
 */
function buildTusFacturasWebhookUrl(): string | undefined {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  const secret = process.env.TUSFACTURAS_WEBHOOK_SECRET;
  if (!appUrl || !secret) return undefined;
  if (!appUrl.startsWith('https://')) return undefined;
  return `${appUrl}/api/webhooks/tusfacturas?secret=${encodeURIComponent(secret)}`;
}

// Configuración de cobranzas: medios de pago que el club admite para
// comprobantes internos. Lista vacía = deshabilita la emisión de comprobantes
// internos en toda la app (tilde del socio, Cargar Servicio, Ventas y
// Cobranzas).
export async function saveMediosCobroInternosAction(medios: string[]): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden editar la configuración.' };

  if (!Array.isArray(medios) || medios.some((m) => !MEDIO_PAGO_VALUES.includes(m))) {
    return { error: 'Medio de pago inválido.' };
  }
  const unicos = [...new Set(medios)];

  await db
    .update(guarderias)
    .set({ mediosCobroInternos: unicos, updatedAt: new Date() })
    .where(eq(guarderias.id, ctx.activeMembership.guarderiaId));

  revalidatePath('/configuracion');
  revalidatePath('/cobranzas');
  revalidatePath('/ventas');
  return {};
}

/**
 * Guarda el período de anulación de recibos del club (mig 0155).
 *
 * No se valida solo el formato: el valor tiene que ser uno de los cuatro
 * definidos, y el CHECK de la tabla es la última red.
 */
export async function savePeriodoAnulacionReciboAction(
  periodo: string,
): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden editar la configuración.' };

  if (!esPeriodoAnulacion(periodo)) return { error: 'Período de anulación inválido.' };

  await db
    .update(guarderias)
    .set({ periodoAnulacionRecibo: periodo, updatedAt: new Date() })
    .where(eq(guarderias.id, ctx.activeMembership.guarderiaId));

  revalidatePath('/configuracion');
  revalidatePath('/cobranzas');
  return {};
}

export type SavePuntoVentaData = {
  puntoDeVenta: number;
  razonSocial: string;
  cuit: string;
  condicionIva: CondicionIva;
  condicionIibb: CondicionIibb | '';
  fechaInicio: string; // 'YYYY-MM-DD' (del input date)
};

export async function savePuntoVentaAction(data: SavePuntoVentaData): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden editar la configuración.' };

  if (!Number.isInteger(data.puntoDeVenta) || data.puntoDeVenta <= 0) {
    return { error: 'El centro emisor debe ser un número entero positivo.' };
  }
  if (!data.razonSocial.trim()) return { error: 'La razón social es obligatoria.' };
  if (!data.cuit.trim()) return { error: 'El CUIT es obligatorio.' };
  if (!CONDICIONES_IVA.includes(data.condicionIva)) return { error: 'Condición IVA inválida.' };
  if (!data.fechaInicio) return { error: 'La fecha de inicio es obligatoria.' };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  const [guarderia] = await db
    .select({
      direccion: guarderias.direccion,
      email: guarderias.email,
      rubro: guarderias.rubro,
    })
    .from(guarderias)
    .where(eq(guarderias.id, guarderiaId))
    .limit(1);

  if (!guarderia) return { error: 'Guardería no encontrada.' };
  if (!guarderia.direccion || !guarderia.email) {
    return {
      error: 'Completá dirección y email en Datos de la Guardería antes de configurar el POS.',
    };
  }

  // El formulario de Datos Impositivos opera siempre sobre el centro emisor
  // principal: primer alta lo crea; después modifica sus datos en TusFacturas.
  const [principal] = await db
    .select()
    .from(guarderiaCentrosEmisores)
    .where(
      and(
        eq(guarderiaCentrosEmisores.guarderiaId, guarderiaId),
        eq(guarderiaCentrosEmisores.esPrincipal, true),
      ),
    )
    .limit(1);

  const esModificacion = !!principal;

  if (principal && (!principal.apikey || !principal.apitoken || !principal.usertoken)) {
    return { error: 'No se encontraron las credenciales del POS. Contactá a soporte.' };
  }

  const ivaCode = CONDICION_IVA_API[data.condicionIva];
  if (!ivaCode) return { error: 'No se pudo mapear la condición IVA.' };

  const webhookUrl = buildTusFacturasWebhookUrl();

  const posCreds = principal
    ? {
        apikey: principal.apikey!,
        apitoken: principal.apitoken!,
        usertoken: principal.usertoken!,
      }
    : undefined;

  let tusResponse;
  try {
    tusResponse = await administrarPuntoVenta(
      {
        operacion: esModificacion ? 'M' : 'A',
        punto_venta: String(principal ? principal.puntoDeVenta : data.puntoDeVenta),
        direccion: guarderia.direccion,
        razon_social: data.razonSocial.trim(),
        cuit: data.cuit.trim(),
        iva_condicion: ivaCode,
        iva_emails: guarderia.email,
        ...(data.condicionIibb
          ? { iibb: CONDICION_IIBB_LABEL[data.condicionIibb as CondicionIibb] }
          : {}),
        fecha_inicio: toTusFecha(data.fechaInicio),
        factura_afip: 'S',
        es_agente_retencion: 'N',
        esta_activo: 'S',
        es_predeterminado: 'S',
        conceptos_tipo: 'PS',
        ...(webhookUrl ? { webhook: webhookUrl } : {}),
      },
      posCreds,
    );
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Error al sincronizar con TusFacturas.',
    };
  }

  const credsDevueltas = {
    ...(tusResponse.apikey != null && { apikey: String(tusResponse.apikey) }),
    ...(tusResponse.apitoken != null && { apitoken: tusResponse.apitoken }),
    ...(tusResponse.usertoken != null && { usertoken: tusResponse.usertoken }),
  };

  if (principal) {
    if (Object.keys(credsDevueltas).length > 0) {
      await db
        .update(guarderiaCentrosEmisores)
        .set({ ...credsDevueltas, updatedAt: new Date() })
        .where(eq(guarderiaCentrosEmisores.id, principal.id));
    }
  } else {
    await db.insert(guarderiaCentrosEmisores).values({
      guarderiaId,
      nombre: 'Centro emisor principal',
      puntoDeVenta: data.puntoDeVenta,
      esPrincipal: true,
      ...credsDevueltas,
    });
  }

  // Las columnas singulares de guarderias quedan espejando el principal (red
  // de seguridad para lectores no migrados) + los datos impositivos del CUIT,
  // que son de la guardería (los comparten todos sus centros emisores).
  await db
    .update(guarderias)
    .set({
      ...(esModificacion ? {} : { puntoDeVenta: data.puntoDeVenta }),
      razonSocial: data.razonSocial.trim(),
      cuit: data.cuit.trim(),
      condicionIva: data.condicionIva,
      condicionIibb: (data.condicionIibb || null) as CondicionIibb | null,
      rubro: guarderia.rubro?.trim() || 'Servicios náuticos',
      fechaInicio: new Date(data.fechaInicio),
      ...(tusResponse.apikey != null && { tusfacturasApikey: String(tusResponse.apikey) }),
      ...(tusResponse.apitoken != null && { tusfacturasApitoken: tusResponse.apitoken }),
      ...(tusResponse.usertoken != null && { tusfacturasUsertoken: tusResponse.usertoken }),
      updatedAt: new Date(),
    })
    .where(eq(guarderias.id, guarderiaId));

  // Club Monotributista: nunca muestra ni cobra IVA (emite Factura C). Si el
  // club pasa a Monotributo, cualquier tarifa que tuviera alícuota cargada se
  // sanea a 0 — el bloqueo del Tarifario solo aplica al editar (mismo criterio
  // que la mig 0137 para los datos legacy).
  if (data.condicionIva === 'monotributo') {
    await db
      .update(servicios)
      .set({ alicuotaIva: '0', updatedAt: new Date() })
      .where(and(eq(servicios.guarderiaId, guarderiaId), gt(servicios.alicuotaIva, '0')));
  }

  revalidatePath('/configuracion');
  return {};
}

// ─── Centros emisores adicionales ───────────────────────────────────────────

export type AgregarCentroEmisorData = {
  nombre: string;
  puntoDeVenta: number;
};

/**
 * Da de alta un centro emisor (punto de venta ARCA) adicional en TusFacturas
 * y lo registra para esta guardería. Reusa los datos impositivos ya cargados
 * (razón social, CUIT, condición IVA, fecha de inicio) — todos los centros
 * emisores de una guardería comparten CUIT.
 */
export async function agregarCentroEmisorAction(
  data: AgregarCentroEmisorData,
): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden editar la configuración.' };

  const nombre = data.nombre.trim();
  if (!nombre) return { error: 'Poné un nombre al centro emisor (ej. "Sucursal río").' };
  if (!Number.isInteger(data.puntoDeVenta) || data.puntoDeVenta <= 0) {
    return { error: 'El centro emisor debe ser un número entero positivo.' };
  }

  const guarderiaId = ctx.activeMembership.guarderiaId;

  const [guarderia] = await db
    .select({
      direccion: guarderias.direccion,
      email: guarderias.email,
      razonSocial: guarderias.razonSocial,
      cuit: guarderias.cuit,
      condicionIva: guarderias.condicionIva,
      condicionIibb: guarderias.condicionIibb,
      fechaInicio: guarderias.fechaInicio,
    })
    .from(guarderias)
    .where(eq(guarderias.id, guarderiaId))
    .limit(1);

  if (!guarderia) return { error: 'Guardería no encontrada.' };
  if (
    !guarderia.razonSocial?.trim() ||
    !guarderia.cuit?.trim() ||
    !guarderia.condicionIva ||
    !guarderia.fechaInicio
  ) {
    return {
      error:
        'Primero completá los Datos Impositivos (razón social, CUIT, condición IVA y fecha de inicio) antes de agregar otro centro emisor.',
    };
  }

  const [duplicado] = await db
    .select({ id: guarderiaCentrosEmisores.id, activo: guarderiaCentrosEmisores.activo })
    .from(guarderiaCentrosEmisores)
    .where(
      and(
        eq(guarderiaCentrosEmisores.guarderiaId, guarderiaId),
        eq(guarderiaCentrosEmisores.puntoDeVenta, data.puntoDeVenta),
      ),
    )
    .limit(1);
  if (duplicado) {
    // Si el que choca está dado de baja, el alta sería un callejón sin salida
    // ("ya existe" pero no se ve en el selector): se indica reactivarlo.
    return {
      error: duplicado.activo
        ? 'Ya existe un centro emisor con ese número.'
        : 'Ya existe un centro emisor con ese número, dado de baja. Reactivalo desde la lista en vez de crearlo de nuevo.',
    };
  }

  const ivaCode = CONDICION_IVA_API[guarderia.condicionIva];
  if (!ivaCode) return { error: 'No se pudo mapear la condición IVA de la guardería.' };

  const webhookUrl = buildTusFacturasWebhookUrl();

  // Alta con las creds master de NauticaApp (igual que el primer POS);
  // TusFacturas devuelve credenciales propias del POS nuevo.
  let tusResponse;
  try {
    tusResponse = await administrarPuntoVenta({
      operacion: 'A',
      punto_venta: String(data.puntoDeVenta),
      direccion: guarderia.direccion ?? '',
      razon_social: guarderia.razonSocial.trim(),
      cuit: guarderia.cuit.trim(),
      iva_condicion: ivaCode,
      iva_emails: guarderia.email ?? '',
      ...(guarderia.condicionIibb
        ? { iibb: CONDICION_IIBB_LABEL[guarderia.condicionIibb as CondicionIibb] }
        : {}),
      fecha_inicio: toTusFecha(guarderia.fechaInicio),
      factura_afip: 'S',
      es_agente_retencion: 'N',
      esta_activo: 'S',
      // El predeterminado de TusFacturas sigue siendo el principal.
      es_predeterminado: 'N',
      conceptos_tipo: 'PS',
      ...(webhookUrl ? { webhook: webhookUrl } : {}),
    });
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Error al sincronizar con TusFacturas.',
    };
  }

  await db.insert(guarderiaCentrosEmisores).values({
    guarderiaId,
    nombre,
    puntoDeVenta: data.puntoDeVenta,
    esPrincipal: false,
    ...(tusResponse.apikey != null && { apikey: String(tusResponse.apikey) }),
    ...(tusResponse.apitoken != null && { apitoken: tusResponse.apitoken }),
    ...(tusResponse.usertoken != null && { usertoken: tusResponse.usertoken }),
  });

  revalidatePath('/configuracion');
  return {};
}

/**
 * Marca un centro emisor como principal (el que usan el cron de auto-emisión
 * y todo flujo que no elige a mano) y espeja sus datos en las columnas
 * singulares de guarderias.
 */
export async function marcarCentroEmisorPrincipalAction(
  centroEmisorId: string,
): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden editar la configuración.' };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  const [centro] = await db
    .select()
    .from(guarderiaCentrosEmisores)
    .where(
      and(
        eq(guarderiaCentrosEmisores.id, centroEmisorId),
        eq(guarderiaCentrosEmisores.guarderiaId, guarderiaId),
      ),
    )
    .limit(1);
  if (!centro) return { error: 'Centro emisor no encontrado.' };
  if (centro.esPrincipal) return {};

  await db.transaction(async (tx) => {
    await tx
      .update(guarderiaCentrosEmisores)
      .set({ esPrincipal: false, updatedAt: new Date() })
      .where(
        and(
          eq(guarderiaCentrosEmisores.guarderiaId, guarderiaId),
          eq(guarderiaCentrosEmisores.esPrincipal, true),
        ),
      );
    await tx
      .update(guarderiaCentrosEmisores)
      .set({ esPrincipal: true, updatedAt: new Date() })
      .where(eq(guarderiaCentrosEmisores.id, centro.id));
    // Espejo del principal en guarderias (lectores no migrados).
    await tx
      .update(guarderias)
      .set({
        puntoDeVenta: centro.puntoDeVenta,
        tusfacturasApikey: centro.apikey,
        tusfacturasApitoken: centro.apitoken,
        tusfacturasUsertoken: centro.usertoken,
        updatedAt: new Date(),
      })
      .where(eq(guarderias.id, guarderiaId));
  });

  revalidatePath('/configuracion');
  return {};
}

/** Renombra un centro emisor (solo el nombre visible — el número es fijo). */
export async function renombrarCentroEmisorAction(
  centroEmisorId: string,
  nombre: string,
): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden editar la configuración.' };

  const limpio = nombre.trim();
  if (!limpio) return { error: 'El nombre no puede quedar vacío.' };

  const result = await db
    .update(guarderiaCentrosEmisores)
    .set({ nombre: limpio, updatedAt: new Date() })
    .where(
      and(
        eq(guarderiaCentrosEmisores.id, centroEmisorId),
        eq(guarderiaCentrosEmisores.guarderiaId, ctx.activeMembership.guarderiaId),
      ),
    )
    .returning({ id: guarderiaCentrosEmisores.id });
  if (result.length === 0) return { error: 'Centro emisor no encontrado.' };

  revalidatePath('/configuracion');
  return {};
}

/**
 * Da de baja (o reactiva) un centro emisor.
 *
 * Es baja LÓGICA a propósito: los comprobantes ya emitidos tienen que seguir
 * apuntando a su punto de venta para la trazabilidad ante ARCA, así que nunca
 * se borra la fila. Un centro de baja deja de ofrecerse al emitir; reimprimir
 * o reenviar un comprobante viejo sigue funcionando por su POS original.
 *
 * Dos guardas:
 *  - El PRINCIPAL no se da de baja: lo usa la facturación automática mensual.
 *    Primero hay que designar otro principal.
 *  - No se puede quedar sin ningún centro activo (dejaría al club sin poder
 *    facturar). Redundante con la guarda del principal, pero explícita.
 */
export async function toggleBajaCentroEmisorAction(
  centroEmisorId: string,
  darDeBaja: boolean,
): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden editar la configuración.' };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  const [centro] = await db
    .select({
      id: guarderiaCentrosEmisores.id,
      nombre: guarderiaCentrosEmisores.nombre,
      esPrincipal: guarderiaCentrosEmisores.esPrincipal,
      activo: guarderiaCentrosEmisores.activo,
    })
    .from(guarderiaCentrosEmisores)
    .where(
      and(
        eq(guarderiaCentrosEmisores.id, centroEmisorId),
        eq(guarderiaCentrosEmisores.guarderiaId, guarderiaId),
      ),
    )
    .limit(1);
  if (!centro) return { error: 'Centro emisor no encontrado.' };
  if (centro.activo !== darDeBaja) return {}; // ya está como se pide

  if (darDeBaja) {
    if (centro.esPrincipal) {
      return {
        error:
          'No se puede dar de baja el centro emisor principal, porque es el que usa la facturación automática. Designá otro como principal y volvé a intentar.',
      };
    }
    const activos = await db
      .select({ id: guarderiaCentrosEmisores.id })
      .from(guarderiaCentrosEmisores)
      .where(
        and(
          eq(guarderiaCentrosEmisores.guarderiaId, guarderiaId),
          eq(guarderiaCentrosEmisores.activo, true),
        ),
      );
    if (activos.length <= 1) {
      return {
        error: 'Es el único centro emisor activo. Sin centros activos el club no podría facturar.',
      };
    }
  }

  await db
    .update(guarderiaCentrosEmisores)
    .set({
      activo: !darDeBaja,
      // Queda registrado el cuándo (pedido del cliente 2026-09-02). Al
      // reactivar se limpia: un centro activo no tiene fecha de baja.
      bajaAt: darDeBaja ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(guarderiaCentrosEmisores.id, centro.id));

  revalidatePath('/configuracion');
  revalidatePath('/ventas');
  return {};
}

// Marca el certificado AFIP como instalado/confirmado por el admin.
// Después de "Solicitar certificado AFIP" tusfacturas manda instrucciones
// al mail del admin de la cuenta TF. Una vez que las sigue (instala el
// certificado en TF/AFIP) vuelve y clickea "Confirmar instalación", que
// dispara esta action y desbloquea la facturación.
export async function confirmarCertificadoAfipAction(ok: boolean): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden confirmar el certificado.' };

  await db
    .update(guarderias)
    .set({ certificadoAfipOk: ok, updatedAt: new Date() })
    .where(eq(guarderias.id, ctx.activeMembership.guarderiaId));

  revalidatePath('/configuracion');
  return {};
}

// Solicita el certificado de enlace con AFIP para el POS de la guarderia
// activa. Tusfacturas genera el certificado y manda instrucciones al mail
// del admin. Loggeamos el response crudo la primera vez para entender
// qué devuelve.
export async function solicitarCertificadoAfipAction(): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden solicitar el certificado.' };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  // El certificado de enlace es por CUIT: se solicita con las creds del
  // centro emisor principal y aplica a todos los POS de la guardería.
  const [g] = await db
    .select({
      apikey: guarderiaCentrosEmisores.apikey,
      apitoken: guarderiaCentrosEmisores.apitoken,
      usertoken: guarderiaCentrosEmisores.usertoken,
    })
    .from(guarderiaCentrosEmisores)
    .where(
      and(
        eq(guarderiaCentrosEmisores.guarderiaId, guarderiaId),
        eq(guarderiaCentrosEmisores.esPrincipal, true),
      ),
    )
    .limit(1);

  if (!g || !g.apikey || !g.apitoken || !g.usertoken) {
    return {
      error: 'Primero configurá los datos de facturación (POS) antes de solicitar el certificado.',
    };
  }

  try {
    const res = await solicitarCertificadoEnlace({
      apikey: g.apikey,
      apitoken: g.apitoken,
      usertoken: g.usertoken,
    });
    console.log('[certificado-afip] response', { guarderiaId, res });
    return {};
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Error al solicitar el certificado.',
    };
  }
}

// =============================================================================
// EQUIPO
// =============================================================================

const ROLES = [
  'super_admin',
  'administrador_general',
  'administrativo',
  'operario',
  'marinero',
  'contable',
  'mantenimiento',
  'comunicaciones',
  'restaurantes',
  'socio',
  'invitado',
  'proveedor',
  'seguridad',
] as const;
type Rol = (typeof ROLES)[number];

export type CreateMiembroEquipoData = {
  nombre: string;
  apellido: string;
  email: string;
  rol: Rol;
  dni: string;
  telefono: string;
  sede: string;
};

// =============================================================================
// PLAN DEL CLUB
// =============================================================================

const PLANES = ['esencial', 'premium', 'elite'] as const;
type Plan = (typeof PLANES)[number];

export async function updateGuarderiaPlanAction(plan: Plan): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden cambiar el plan.' };
  if (!PLANES.includes(plan)) return { error: 'Plan inválido.' };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  // El cambio se difiere al 1° del mes siguiente (cron aplicará plan_pendiente → plan).
  await db
    .update(guarderias)
    .set({ planPendiente: plan, updatedAt: new Date() })
    .where(eq(guarderias.id, guarderiaId));

  revalidatePath('/configuracion');
  return {};
}

export async function cancelPendingPlanAction(): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden cancelar el cambio de plan.' };

  await db
    .update(guarderias)
    .set({ planPendiente: null, updatedAt: new Date() })
    .where(eq(guarderias.id, ctx.activeMembership.guarderiaId));

  revalidatePath('/configuracion');
  return {};
}

export type UpdateMiembroEquipoData = {
  profileId: string;
  nombre: string;
  apellido: string;
  rol: Rol;
  dni: string;
  telefono: string;
  sede: string;
};

export async function updateMiembroEquipoAction(
  data: UpdateMiembroEquipoData,
): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden editar miembros.' };

  const nombre = data.nombre.trim();
  const apellido = data.apellido.trim();
  if (!nombre || !apellido) return { error: 'Nombre y apellido son obligatorios.' };
  if (!ROLES.includes(data.rol)) return { error: 'Rol inválido.' };
  // super_admin no se asigna desde el panel de la guardería — eso solo va
  // por /super-admin/usuarios. Evita que un admin de club promueva a alguien
  // a super admin de plataforma.
  if (data.rol === 'super_admin') {
    return { error: 'No se puede asignar el rol Super Admin desde Configuración.' };
  }

  const guarderiaId = ctx.activeMembership.guarderiaId;

  // Validar que el miembro pertenezca a esta guardería antes de editarlo.
  // Multi-tenancy: sin esto un admin podría editar miembros de otro club.
  const [membership] = await db
    .select({ id: memberships.id, rol: memberships.rol })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, data.profileId),
        eq(memberships.guarderiaId, guarderiaId),
        eq(memberships.status, 'active'),
      ),
    )
    .limit(1);
  if (!membership) return { error: 'El miembro no pertenece a esta guardería.' };

  // Si el admin se está editando a sí mismo, no permitir cambiarse a un rol
  // que no sea admin (queda afuera del panel).
  const isSelf = data.profileId === ctx.profile.id;
  if (isSelf && data.rol !== 'administrador_general' && data.rol !== 'administrativo') {
    return { error: 'No te podés cambiar a un rol no administrativo (te quedarías sin acceso).' };
  }

  await db
    .update(profiles)
    .set({
      nombre,
      apellido,
      telefono: data.telefono.trim() || null,
      numeroDocumento: data.dni.trim() || null,
      tipoDocumento: data.dni.trim() ? 'dni' : null,
      sede: data.sede.trim() || null,
    })
    .where(eq(profiles.id, data.profileId));

  if (membership.rol !== data.rol) {
    await db
      .update(memberships)
      .set({ rol: data.rol, updatedAt: new Date() })
      .where(eq(memberships.id, membership.id));
  }

  revalidatePath('/configuracion');
  return {};
}

export async function deleteMiembroEquipoAction(profileId: string): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden eliminar miembros.' };

  if (profileId === ctx.profile.id) {
    return { error: 'No te podés eliminar a vos mismo.' };
  }

  const guarderiaId = ctx.activeMembership.guarderiaId;

  // Validar que el target pertenezca a esta guardería (multi-tenancy).
  const [target] = await db
    .select({
      membershipId: memberships.id,
      isSuperAdmin: profiles.isSuperAdmin,
    })
    .from(memberships)
    .innerJoin(profiles, eq(profiles.id, memberships.userId))
    .where(
      and(
        eq(memberships.userId, profileId),
        eq(memberships.guarderiaId, guarderiaId),
        eq(memberships.status, 'active'),
      ),
    )
    .limit(1);
  if (!target) return { error: 'El miembro no pertenece a esta guardería.' };
  if (target.isSuperAdmin) {
    return { error: 'No se puede eliminar a un Super Admin desde Configuración.' };
  }

  // Borrar la cuenta de auth: el cascade desde auth.users borra profiles +
  // memberships en todas las guarderías + datos asociados. Es destructivo;
  // la UI debe pedir confirm.
  const admin = createAdminClient();
  const { error: deleteErr } = await admin.auth.admin.deleteUser(profileId);
  if (deleteErr) {
    console.error('[deleteMiembroEquipoAction] deleteUser error', { profileId, deleteErr });
    return { error: `No se pudo eliminar la cuenta: ${deleteErr.message}` };
  }

  revalidatePath('/configuracion');
  return {};
}

export async function createMiembroEquipoAction(
  data: CreateMiembroEquipoData,
): Promise<{ error?: string; profileId?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden agregar miembros.' };

  const nombre = data.nombre.trim();
  const apellido = data.apellido.trim();
  const email = data.email.toLowerCase().trim();
  if (!nombre || !apellido || !email) {
    return { error: 'Nombre, apellido y email son obligatorios.' };
  }
  if (!ROLES.includes(data.rol)) return { error: 'Rol inválido.' };

  const guarderiaId = ctx.activeMembership.guarderiaId;
  const admin = createAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) throw new Error('NEXT_PUBLIC_APP_URL no configurado');

  const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${appUrl}/auth/callback?next=/crear-cuenta`,
  });

  if (inviteError) {
    console.error('[createMiembroEquipoAction] inviteError', { email, inviteError });
    return { error: translateInviteError(inviteError.message) };
  }

  const profileId = inviteData.user.id;

  try {
    await db
      .insert(profiles)
      .values({
        id: profileId,
        email,
        nombre,
        apellido,
        telefono: data.telefono.trim() || null,
        numeroDocumento: data.dni.trim() || null,
        tipoDocumento: data.dni.trim() ? 'dni' : null,
        sede: data.sede.trim() || null,
      })
      .onConflictDoUpdate({
        target: profiles.id,
        set: {
          email,
          nombre,
          apellido,
          telefono: data.telefono.trim() || null,
          numeroDocumento: data.dni.trim() || null,
          tipoDocumento: data.dni.trim() ? 'dni' : null,
          sede: data.sede.trim() || null,
        },
      });

    await db
      .insert(memberships)
      .values({
        userId: profileId,
        guarderiaId,
        rol: data.rol,
        status: 'active',
      })
      .onConflictDoNothing();

    revalidatePath('/configuracion');
    return { profileId };
  } catch {
    await admin.auth.admin.deleteUser(profileId).catch(() => null);
    return { error: 'Error al registrar el miembro. Intentá de nuevo.' };
  }
}

// =============================================================================
// PAYWAY — credenciales por guardería
// =============================================================================

export type SavePaywayCredsData = {
  publicKey: string;
  privateKey: string;
};

export async function savePaywayCredsAction(
  data: SavePaywayCredsData,
): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden configurar Payway.' };

  const publicKey = data.publicKey.trim();
  const privateKey = data.privateKey.trim();
  if (!publicKey) return { error: 'La public key es obligatoria.' };
  if (!privateKey) return { error: 'La private key es obligatoria.' };

  await db
    .update(guarderias)
    .set({ paywayPublicKey: publicKey, paywayPrivateKey: privateKey, updatedAt: new Date() })
    .where(eq(guarderias.id, ctx.activeMembership.guarderiaId));

  revalidatePath('/configuracion');
  return {};
}

export async function deletePaywayCredsAction(): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden desconectar Payway.' };

  await db
    .update(guarderias)
    .set({ paywayPublicKey: null, paywayPrivateKey: null, updatedAt: new Date() })
    .where(eq(guarderias.id, ctx.activeMembership.guarderiaId));

  revalidatePath('/configuracion');
  return {};
}

// =============================================================================
// IMAGENES DE LA GUARDERIA
// =============================================================================

const BUCKET_GUARDERIA_FOTOS = 'guarderia-fotos';
const MAX_IMAGEN_BYTES = 8 * 1024 * 1024; // 8 MB
const TIPOS_IMAGEN_ACEPTADOS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

async function ensureGuarderiaFotosBucket(
  admin: ReturnType<typeof createAdminClient>,
): Promise<void> {
  const { data: buckets } = await admin.storage.listBuckets();
  const exists = buckets?.some((b) => b.name === BUCKET_GUARDERIA_FOTOS);
  if (!exists) {
    await admin.storage.createBucket(BUCKET_GUARDERIA_FOTOS, { public: true });
  }
}

// Sube una imagen de la guarderia al bucket publico y devuelve la URL.
// La persistencia del array `imagenes` la hace updateGuarderiaGeneralAction
// cuando el admin guarda el form — esta action solo se encarga del upload.
export async function uploadGuarderiaImagenAction(
  formData: FormData,
): Promise<{ error?: string; url?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden subir imágenes.' };

  const file = formData.get('file');
  if (!(file instanceof File)) return { error: 'Archivo inválido.' };
  if (file.size === 0) return { error: 'El archivo está vacío.' };
  if (file.size > MAX_IMAGEN_BYTES) return { error: 'La imagen supera el tamaño máximo (8 MB).' };
  if (file.type && !TIPOS_IMAGEN_ACEPTADOS.includes(file.type)) {
    return { error: 'Formato no soportado. Usá JPG, PNG, WebP o GIF.' };
  }

  const admin = createAdminClient();
  await ensureGuarderiaFotosBucket(admin);

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${ctx.activeMembership.guarderiaId}/${Date.now()}-${safeName}`;

  const { error: uploadErr } = await admin.storage
    .from(BUCKET_GUARDERIA_FOTOS)
    .upload(path, file, { contentType: file.type || 'application/octet-stream' });
  if (uploadErr) return { error: `Error subiendo imagen: ${uploadErr.message}` };

  const { data: urlData } = admin.storage.from(BUCKET_GUARDERIA_FOTOS).getPublicUrl(path);
  return { url: urlData.publicUrl };
}
