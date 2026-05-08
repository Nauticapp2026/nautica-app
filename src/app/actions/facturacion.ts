'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { db } from '@/lib/db';
import {
  facturacion,
  facturacionItemMovimientos,
  facturacionItems,
  guarderias,
  memberships,
  movimientosCuentaCorriente,
  profiles,
} from '@/lib/db/schema';
import { getActiveMarina } from '@/lib/auth/session';
import {
  crearFactura,
  toTusFecha,
  type TusFacturasCliente,
  type TusFacturasComprobante,
  type TusFacturasCredentials,
  type TusFacturasDetalleItem,
  type TusFacturasFormaPago,
} from '@/lib/tusfacturas/client';
import {
  CONDICION_IVA_API,
  CONDICION_PAGO_API,
  FORMA_PAGO_LABEL,
  TIPO_DOC_API,
  TIPO_FACTURA_API,
} from '@/lib/tusfacturas/mappers';

// ─── Tipos ──────────────────────────────────────────────────────────────────

type TipoFactura = 'factura_a' | 'factura_b' | 'factura_c';
type CondicionVenta =
  | 'contado'
  | 'cuenta_corriente'
  | 'tarjeta_credito'
  | 'tarjeta_debito'
  | 'transferencia_bancaria'
  | 'mercadopago'
  | 'payway'
  | 'dias_5'
  | 'dias_10'
  | 'dias_15'
  | 'dias_20'
  | 'dias_30'
  | 'dias_45'
  | 'dias_60'
  | 'dias_90'
  | 'otros';
type MedioPago =
  | 'efectivo'
  | 'tarjeta_credito'
  | 'tarjeta_debito'
  | 'debito_automatico'
  | 'transferencia'
  | 'cheque';

type EstadoFactura = 'pagada' | 'pendiente' | 'vencida';

export type CreateInvoiceData = {
  socioId: string;
  tipoFactura: TipoFactura;
  condicionVenta: CondicionVenta;
  medioPago: MedioPago;
  estado?: EstadoFactura;
  descripcion?: string;
  fecha: string; // ISO yyyy-mm-dd
  vencimiento: string;
  desde: string;
  hasta: string;
  /** Si se provee, se marcan como facturados/pagados y se linkean a items de la factura. */
  movimientoIds?: string[];
  /** Línea libre si no hay movimientos. */
  items?: { descripcion: string; cantidad: number; importeUnitario: number }[];
};

export type CreateBatchInvoiceData = {
  socioIds: string[];
  tipoFactura: TipoFactura;
  condicionVenta: CondicionVenta;
  medioPago: MedioPago;
  fecha: string;
  vencimiento: string;
  desde: string;
  hasta: string;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function alicuotaPara(tipo: TipoFactura): string {
  // Factura C (Monotributo) → sin IVA discriminado
  return tipo === 'factura_c' ? '0' : '21';
}

function precioSinIva(total: number, alicuota: string): number {
  const a = parseFloat(alicuota);
  if (!a) return total;
  return +(total / (1 + a / 100)).toFixed(2);
}

function buildCliente(p: {
  email: string;
  nombre: string | null;
  apellido: string | null;
  razonSocial: string | null;
  tipoDocumento: string | null;
  numeroDocumento: string | null;
  direccion: string | null;
  condicionIva: string | null;
  condicionVenta: CondicionVenta;
}): TusFacturasCliente {
  const razon =
    p.razonSocial?.trim() || [p.nombre, p.apellido].filter(Boolean).join(' ').trim() || p.email;

  const condicionPago = CONDICION_PAGO_API[p.condicionVenta] ?? '201';

  return {
    documento_tipo: TIPO_DOC_API[p.tipoDocumento ?? ''] ?? 'OTRO',
    documento_nro: p.numeroDocumento ?? '',
    razon_social: razon,
    email: p.email,
    domicilio: p.direccion ?? '',
    provincia: '1', // CABA por defecto — TODO: hacer configurable por guardería/socio
    envia_por_mail: 'S',
    reclama_deuda: 'N',
    condicion_pago: condicionPago,
    // Si condicionVenta = 'otros' (código 214), AFIP requiere descripción adicional.
    ...(condicionPago === '214' ? { condicion_pago_otra: 'Otros' } : {}),
    condicion_iva: CONDICION_IVA_API[p.condicionIva ?? ''] ?? 'CF',
    condicion_iva_operacion: '1',
  };
}

function buildDetalle(
  items: { descripcion: string; cantidad: number; importeUnitario: number }[],
  tipo: TipoFactura,
): TusFacturasDetalleItem[] {
  const alicuota = alicuotaPara(tipo);
  return items.map((it) => ({
    cantidad: it.cantidad,
    producto: {
      descripcion: it.descripcion,
      codigo: 'NAUT-001',
      lista_precios: 'standard',
      leyenda: '',
      unidad_bulto: 1,
      alicuota,
      precio_unitario_sin_iva: precioSinIva(it.importeUnitario, alicuota),
    },
    leyenda: '',
    tratamiento_descuento: 'A',
    bonificacion_porcentaje: 0,
  }));
}

function totalItems(items: { cantidad: number; importeUnitario: number }[]): number {
  return items.reduce((s, i) => s + i.cantidad * i.importeUnitario, 0);
}

function buildPagos(total: number, medio: MedioPago): TusFacturasFormaPago[] {
  return [{ descripcion: FORMA_PAGO_LABEL[medio] ?? 'Otro', importe: total }];
}

/**
 * Valida que el socio tenga documento compatible con su condición ante el IVA.
 * Devuelve mensaje de error si hay inconsistencia, o null si está OK.
 *
 * Reglas de tusfacturas.app / AFIP:
 *  - Si condición IVA = Responsable Inscripto o Monotributo → requiere CUIT válido (11 dígitos).
 *  - Si tipo documento = CUIT/CUIL → número debe tener 11 dígitos.
 *  - Si tipo documento = DNI → número debe ser numérico (7-8 dígitos).
 *  - Consumidor Final sin documento es válido (se factura al consumidor anónimo).
 */
function validarDocumentoSocio(p: {
  tipoDocumento: string | null;
  numeroDocumento: string | null;
  condicionIva: string | null;
}): string | null {
  const tipo = p.tipoDocumento ?? '';
  const nro = (p.numeroDocumento ?? '').replace(/[\s-]/g, '');
  const iva = p.condicionIva ?? '';

  const requiereCuit = iva === 'responsable_inscripto' || iva === 'monotributo';
  if (requiereCuit && tipo !== 'cuit' && tipo !== 'cuil') {
    return 'La condición IVA del socio requiere tipo de documento CUIT/CUIL. Actualizá los datos del socio.';
  }

  if ((tipo === 'cuit' || tipo === 'cuil') && !/^\d{11}$/.test(nro)) {
    return 'El CUIT/CUIL del socio debe tener 11 dígitos. Actualizá los datos del socio.';
  }
  if (tipo === 'dni' && !/^\d{7,8}$/.test(nro)) {
    return 'El DNI del socio debe tener 7 u 8 dígitos. Actualizá los datos del socio.';
  }
  if (requiereCuit && !nro) {
    return 'Falta el número de CUIT/CUIL del socio. Actualizá los datos antes de facturar.';
  }

  return null;
}

// ─── Action: factura individual ─────────────────────────────────────────────

export type FacturaResult = {
  error?: string;
  facturaId?: string;
  comprobanteNro?: string;
  pdfUrl?: string;
};

export async function createInvoiceAction(data: CreateInvoiceData): Promise<FacturaResult> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  return crearFacturaCore({ ...data, guarderiaId: ctx.activeMembership.guarderiaId });
}

/**
 * Core de emisión de factura, sin chequeo de sesión. Llamable desde:
 * - createInvoiceAction (manual, con auth)
 * - cron de auto-facturación (sin auth, recibe guarderiaId)
 */
export async function crearFacturaCore(
  data: CreateInvoiceData & { guarderiaId: string },
): Promise<FacturaResult> {
  const gId = data.guarderiaId;

  // 1. Traer socio validando que sea miembro de la guardería activa
  const [socio] = await db
    .select({
      id: profiles.id,
      email: profiles.email,
      nombre: profiles.nombre,
      apellido: profiles.apellido,
      razonSocial: profiles.razonSocial,
      tipoDocumento: profiles.tipoDocumento,
      numeroDocumento: profiles.numeroDocumento,
      direccion: profiles.direccion,
      condicionIva: profiles.condicionIva,
    })
    .from(profiles)
    .innerJoin(memberships, eq(memberships.userId, profiles.id))
    .where(
      and(
        eq(profiles.id, data.socioId),
        eq(memberships.guarderiaId, gId),
        eq(memberships.status, 'active'),
      ),
    );

  if (!socio) return { error: 'Socio no encontrado en esta guardería.' };

  // 1.a Validar documento del socio antes de llamar a tusfacturas (evita
  // errores crípticos tipo "Error al crear al cliente").
  const validacionSocio = validarDocumentoSocio({
    tipoDocumento: socio.tipoDocumento,
    numeroDocumento: socio.numeroDocumento,
    condicionIva: socio.condicionIva,
  });
  if (validacionSocio) return { error: validacionSocio };

  // 1.b Traer POS + creds propias de la guardería.
  // SIN fallback a env vars: las env vars son las creds master de NauticaApp y
  // solo se usan para dar de alta el POS. Facturar con ellas haría que la
  // factura saliera a nombre de NauticaApp, no de la guardería.
  const [guarderia] = await db
    .select({
      puntoDeVenta: guarderias.puntoDeVenta,
      rubro: guarderias.rubro,
      tusfacturasApikey: guarderias.tusfacturasApikey,
      tusfacturasApitoken: guarderias.tusfacturasApitoken,
      tusfacturasUsertoken: guarderias.tusfacturasUsertoken,
    })
    .from(guarderias)
    .where(eq(guarderias.id, gId))
    .limit(1);

  if (
    !guarderia ||
    guarderia.puntoDeVenta == null ||
    !guarderia.tusfacturasApikey ||
    !guarderia.tusfacturasApitoken ||
    !guarderia.tusfacturasUsertoken
  ) {
    return {
      error:
        'Esta guardería todavía no tiene punto de venta configurado. Andá a Configuración → Punto de venta y completá los datos antes de facturar.',
    };
  }

  const puntoVenta = String(guarderia.puntoDeVenta);
  const rubroGuarderia = guarderia.rubro ?? 'Servicios náuticos';
  const credsOverride: TusFacturasCredentials = {
    apikey: guarderia.tusfacturasApikey,
    apitoken: guarderia.tusfacturasApitoken,
    usertoken: guarderia.tusfacturasUsertoken,
  };

  // 2. Construir items desde movimientos (si llegaron) o desde items libres
  let items: { descripcion: string; cantidad: number; importeUnitario: number }[] = [];
  let movimientoIds = data.movimientoIds ?? [];

  if (movimientoIds.length > 0) {
    const movs = await db
      .select({
        id: movimientosCuentaCorriente.id,
        concepto: movimientosCuentaCorriente.concepto,
        debe: movimientosCuentaCorriente.debe,
      })
      .from(movimientosCuentaCorriente)
      .where(
        and(
          inArray(movimientosCuentaCorriente.id, movimientoIds),
          eq(movimientosCuentaCorriente.socioId, data.socioId),
        ),
      );

    items = movs.map((m) => ({
      descripcion: m.concepto ?? 'Servicio',
      cantidad: 1,
      importeUnitario: parseFloat(m.debe ?? '0'),
    }));
    movimientoIds = movs.map((m) => m.id);
  } else if (data.items && data.items.length > 0) {
    items = data.items;
  }

  if (items.length === 0) return { error: 'No hay items para facturar.' };

  const total = totalItems(items);
  if (total <= 0) return { error: 'El total de la factura debe ser mayor a 0.' };

  // 3. Pre-generar ID para usar como external_reference
  const facturaId = randomUUID();

  // 4. Construir payload y llamar a la API
  const cliente = buildCliente({ ...socio, condicionVenta: data.condicionVenta });
  const comprobante: TusFacturasComprobante = {
    fecha: toTusFecha(data.fecha),
    vencimiento: toTusFecha(data.vencimiento),
    tipo: TIPO_FACTURA_API[data.tipoFactura],
    external_reference: facturaId,
    operacion: 'V',
    punto_venta: puntoVenta,
    moneda: 'PES',
    cotizacion: 1,
    periodo_facturado_desde: toTusFecha(data.desde),
    periodo_facturado_hasta: toTusFecha(data.hasta),
    rubro: rubroGuarderia,
    rubro_grupo_contable: process.env.TUSFACTURAS_RUBRO_GRUPO ?? 'Servicios',
    detalle: buildDetalle(items, data.tipoFactura),
    total: total.toFixed(2),
    pagos: {
      formas_pago: buildPagos(total, data.medioPago),
      total,
    },
  };

  let apiResponse;
  try {
    apiResponse = await crearFactura({ cliente, comprobante }, credsOverride);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Error al emitir factura en tusfacturas.app',
    };
  }

  // 5. Persistir factura + items + linkear movimientos
  try {
    const estadoFactura = data.estado ?? 'pendiente';
    const descripcionFactura =
      data.descripcion?.trim() ||
      `Factura ${TIPO_FACTURA_API[data.tipoFactura]} — ${items[0].descripcion}${
        items.length > 1 ? ` (+${items.length - 1})` : ''
      }`;

    await db.insert(facturacion).values({
      id: facturaId,
      guarderiaId: gId,
      socioId: data.socioId,
      codigo: apiResponse.comprobante_nro ?? null,
      archivo: apiResponse.comprobante_pdf_url ?? null,
      descripcion: descripcionFactura,
      tipoFactura: data.tipoFactura,
      estado: estadoFactura,
      condicionVenta: data.condicionVenta,
      medioPago: data.medioPago,
      importe: total.toFixed(2),
      emision: new Date(data.fecha),
      desde: new Date(data.desde),
      hasta: new Date(data.hasta),
      vencimiento: new Date(data.vencimiento),
      externalReference: facturaId,
    });

    // Insertar items y linkear movimientos
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const [inserted] = await db
        .insert(facturacionItems)
        .values({
          facturacionId: facturaId,
          socioId: data.socioId,
          importe: (it.cantidad * it.importeUnitario).toFixed(2),
          confirmado: true,
        })
        .returning({ id: facturacionItems.id });

      if (movimientoIds[i]) {
        await db.insert(facturacionItemMovimientos).values({
          facturacionItemId: inserted.id,
          movimientoId: movimientoIds[i],
        });
      }
    }

    if (movimientoIds.length > 0) {
      // Si la factura se crea ya pagada, los movimientos también quedan pagados.
      const movEstado = estadoFactura === 'pagada' ? 'pagado' : 'facturado';
      await db
        .update(movimientosCuentaCorriente)
        .set({ estado: movEstado })
        .where(inArray(movimientosCuentaCorriente.id, movimientoIds));
    }

    revalidatePath('/facturacion');
    revalidatePath(`/usuarios/${data.socioId}`);

    return {
      facturaId,
      comprobanteNro: apiResponse.comprobante_nro,
      pdfUrl: apiResponse.comprobante_pdf_url,
    };
  } catch (err) {
    // Factura ya emitida en tusfacturas pero falló nuestra DB → loguear y avisar
    console.error('Factura emitida en tusfacturas pero falló persistencia local', {
      comprobanteNro: apiResponse.comprobante_nro,
      err,
    });
    return {
      error:
        'La factura se emitió en AFIP pero no se pudo guardar. Contactá al administrador con el número ' +
        (apiResponse.comprobante_nro ?? facturaId),
    };
  }
}

// ─── Action: factura en lote ────────────────────────────────────────────────

export type BatchResult = {
  succeeded: { socioId: string; facturaId: string; comprobanteNro?: string }[];
  skipped: { socioId: string; reason: string }[];
  failed: { socioId: string; error: string }[];
};

export async function createBatchInvoicesAction(
  data: CreateBatchInvoiceData,
): Promise<{ error?: string; result?: BatchResult }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };

  if (!data.socioIds.length) return { error: 'Seleccioná al menos un socio.' };

  const gId = ctx.activeMembership.guarderiaId;

  // Filtrar socioIds a solo los que son miembros activos de la guardería actual
  const validos = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(
      and(
        inArray(memberships.userId, data.socioIds),
        eq(memberships.guarderiaId, gId),
        eq(memberships.status, 'active'),
      ),
    );
  const validSocioIds = new Set(validos.map((v) => v.userId));

  const result: BatchResult = { succeeded: [], skipped: [], failed: [] };

  for (const socioId of data.socioIds) {
    if (!validSocioIds.has(socioId)) {
      result.skipped.push({ socioId, reason: 'Socio fuera de la guardería activa' });
      continue;
    }

    // Traer movimientos no pagados / no facturados del socio
    const movs = await db
      .select({ id: movimientosCuentaCorriente.id })
      .from(movimientosCuentaCorriente)
      .where(
        and(
          eq(movimientosCuentaCorriente.socioId, socioId),
          eq(movimientosCuentaCorriente.estado, 'no_pagado'),
        ),
      );

    if (movs.length === 0) {
      result.skipped.push({ socioId, reason: 'Sin movimientos pendientes' });
      continue;
    }

    const res = await createInvoiceAction({
      socioId,
      tipoFactura: data.tipoFactura,
      condicionVenta: data.condicionVenta,
      medioPago: data.medioPago,
      fecha: data.fecha,
      vencimiento: data.vencimiento,
      desde: data.desde,
      hasta: data.hasta,
      movimientoIds: movs.map((m) => m.id),
    });

    if (res.error) {
      result.failed.push({ socioId, error: res.error });
    } else if (res.facturaId) {
      result.succeeded.push({
        socioId,
        facturaId: res.facturaId,
        comprobanteNro: res.comprobanteNro,
      });
    }
  }

  revalidatePath('/facturacion');
  return { result };
}

// ─── Action: traer movimientos pendientes de un socio (scoped a guardería) ──

export type MovimientoPendiente = {
  id: string;
  fecha: string | null;
  concepto: string | null;
  debe: string;
};

export async function getSocioPendientesAction(
  socioId: string,
): Promise<{ error?: string; movimientos?: MovimientoPendiente[] }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };

  const gId = ctx.activeMembership.guarderiaId;

  // Validar que el socio sea miembro activo de la guardería
  const [m] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, socioId),
        eq(memberships.guarderiaId, gId),
        eq(memberships.status, 'active'),
      ),
    );
  if (!m) return { error: 'Socio no pertenece a esta guardería.' };

  const rows = await db
    .select({
      id: movimientosCuentaCorriente.id,
      fecha: movimientosCuentaCorriente.fecha,
      concepto: movimientosCuentaCorriente.concepto,
      debe: movimientosCuentaCorriente.debe,
    })
    .from(movimientosCuentaCorriente)
    .where(
      and(
        eq(movimientosCuentaCorriente.socioId, socioId),
        eq(movimientosCuentaCorriente.estado, 'no_pagado'),
      ),
    )
    .orderBy(movimientosCuentaCorriente.fecha);

  return {
    movimientos: rows.map((r) => ({
      id: r.id,
      fecha: r.fecha ? r.fecha.toISOString() : null,
      concepto: r.concepto,
      debe: r.debe ?? '0',
    })),
  };
}

// ─── Action: marcar factura como pagada ────────────────────────────────────

export async function markInvoicePaidAction(
  id: string,
  medioPago: MedioPago,
): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };

  const gId = ctx.activeMembership.guarderiaId;

  try {
    const [updated] = await db
      .update(facturacion)
      .set({ estado: 'pagada', medioPago })
      .where(and(eq(facturacion.id, id), eq(facturacion.guarderiaId, gId)))
      .returning({ socioId: facturacion.socioId });

    if (!updated) return { error: 'Factura no encontrada.' };

    // Propagar estado 'pagado' a los movimientos vinculados a esta factura
    const items = await db
      .select({ id: facturacionItems.id })
      .from(facturacionItems)
      .where(eq(facturacionItems.facturacionId, id));

    if (items.length > 0) {
      const itemIds = items.map((i) => i.id);
      const links = await db
        .select({ movimientoId: facturacionItemMovimientos.movimientoId })
        .from(facturacionItemMovimientos)
        .where(inArray(facturacionItemMovimientos.facturacionItemId, itemIds));

      const movIds = links.map((l) => l.movimientoId);
      if (movIds.length > 0) {
        await db
          .update(movimientosCuentaCorriente)
          .set({ estado: 'pagado' })
          .where(inArray(movimientosCuentaCorriente.id, movIds));
      }
    }

    revalidatePath('/facturacion');
    if (updated.socioId) revalidatePath(`/usuarios/${updated.socioId}`);
    return {};
  } catch {
    return { error: 'Error al actualizar la factura.' };
  }
}
