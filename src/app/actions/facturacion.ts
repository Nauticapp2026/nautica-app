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
import { fechaCalendariaArg } from '@/lib/dates';
import {
  crearFactura,
  toTusFecha,
  type TusFacturasCliente,
  type TusFacturasComprobante,
  type TusFacturasComprobanteAsociado,
  type TusFacturasCredentials,
  type TusFacturasDetalleItem,
  type TusFacturasFormaPago,
} from '@/lib/tusfacturas/client';
import {
  CONDICION_IVA_API,
  CONDICION_PAGO_API,
  FORMA_PAGO_LABEL,
  NC_TIPO_FACTURA,
  TIPO_DOC_API,
  TIPO_FACTURA_API,
  TIPO_NC_API,
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
  | 'cheque'
  | 'mercado_pago';

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
  socioMovimientos: { socioId: string; movimientoIds: string[] }[];
  medioPago: MedioPago;
  fecha: string;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function derivarTipoFactura(
  guarderiaCondicion: string | null,
  socioCondicion: string | null,
): TipoFactura {
  if (guarderiaCondicion !== 'responsable_inscripto') return 'factura_c';
  if (socioCondicion === 'responsable_inscripto') return 'factura_a';
  return 'factura_b';
}

function alicuotaPara(tipo: TipoFactura): string {
  // Factura C (Monotributo) → sin IVA discriminado
  return tipo === 'factura_c' ? '0' : '21';
}

function precioSinIva(total: number, alicuota: string): number {
  const a = parseFloat(alicuota);
  if (!a) return total;
  return +(total / (1 + a / 100)).toFixed(2);
}

/**
 * Datos del socio relevantes para construir la identidad de facturación.
 * facturaFiscal = true  → facturar con datos PERSONALES (pestaña Generales).
 * facturaFiscal = false → facturar con DATOS IMPOSITIVOS (razón social, CUIT).
 */
type SocioFacturacion = {
  id: string;
  email: string;
  emailFacturacion: string | null;
  nombre: string | null;
  apellido: string | null;
  razonSocial: string | null;
  tipoDocumento: string | null;
  numeroDocumento: string | null;
  cuit: string | null;
  direccion: string | null;
  direccionFiscal: string | null;
  condicionIva: string | null;
  condicionIvaPersonal: string | null;
  facturaFiscal: boolean;
};

/**
 * Identidad fiscal efectiva del socio según el modo de facturación. Usada tanto
 * para validar el documento como para armar el cliente de TusFacturas, así ambos
 * siempre miran los mismos campos. Devuelve los valores en enums internos (DB).
 */
function identidadFacturacion(p: SocioFacturacion): {
  razon: string;
  tipoDocumento: string | null;
  numeroDocumento: string | null;
  condicionIva: string | null;
  domicilio: string;
} {
  const nombreCompleto = [p.nombre, p.apellido].filter(Boolean).join(' ').trim();

  if (p.facturaFiscal) {
    // Datos personales (Generales).
    return {
      razon: nombreCompleto || p.email,
      tipoDocumento: p.tipoDocumento,
      numeroDocumento: p.numeroDocumento,
      condicionIva: p.condicionIvaPersonal,
      domicilio: p.direccion?.trim() || '',
    };
  }

  // Datos impositivos. Si tiene CUIT cargado, es el documento de facturación.
  return {
    razon: p.razonSocial?.trim() || nombreCompleto || p.email,
    tipoDocumento: p.cuit?.trim() ? 'cuit' : p.tipoDocumento,
    numeroDocumento: p.cuit?.trim() || p.numeroDocumento,
    condicionIva: p.condicionIva,
    domicilio: p.direccionFiscal?.trim() || p.direccion?.trim() || '',
  };
}

function buildCliente(
  p: SocioFacturacion & { condicionVenta: CondicionVenta },
): TusFacturasCliente {
  const ident = identidadFacturacion(p);

  const docTipo = TIPO_DOC_API[ident.tipoDocumento ?? ''] ?? 'OTRO';
  const docNro = ident.numeroDocumento || '';

  const condicionPago = CONDICION_PAGO_API[p.condicionVenta] ?? '201';

  return {
    codigo: p.id,
    documento_tipo: docTipo,
    documento_nro: docNro,
    razon_social: ident.razon,
    email: p.emailFacturacion?.trim() || p.email,
    domicilio: ident.domicilio,
    provincia: '1',
    envia_por_mail: 'S',
    reclama_deuda: 'N',
    rg5329: 'N',
    condicion_pago: condicionPago,
    ...(condicionPago === '214' ? { condicion_pago_otra: 'Otros' } : {}),
    condicion_iva: CONDICION_IVA_API[ident.condicionIva ?? ''] ?? 'CF',
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
    afecta_stock: 'N' as const,
    producto: {
      descripcion: it.descripcion,
      codigo: 'NAUT-001',
      lista_precios: 'standard',
      leyenda: '',
      unidad_bulto: 1,
      unidad_medida: 7,
      alicuota,
      precio_unitario_sin_iva: precioSinIva(it.importeUnitario, alicuota),
      actualiza_precio: 'N' as const,
      rg5329: 'N' as const,
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
 * Valida que el socio tenga documento compatible con su condición ante el IVA,
 * mirando la identidad efectiva según el modo de facturación (datos personales
 * vs. datos impositivos). Devuelve mensaje de error o null si está OK.
 *
 * Reglas de tusfacturas.app / AFIP:
 *  - Si condición IVA = Responsable Inscripto o Monotributo → requiere CUIT válido (11 dígitos).
 *  - Si tipo documento = CUIT/CUIL → número debe tener 11 dígitos.
 *  - Si tipo documento = DNI → número debe ser numérico (7-8 dígitos).
 *  - Consumidor Final sin documento es válido (se factura al consumidor anónimo).
 */
function validarDocumentoSocio(socio: SocioFacturacion): string | null {
  const ident = identidadFacturacion(socio);
  const tipo = ident.tipoDocumento ?? '';
  const nro = (ident.numeroDocumento ?? '').replace(/[\s-]/g, '');
  const iva = ident.condicionIva ?? '';

  const requiereCuit = iva === 'responsable_inscripto' || iva === 'monotributo';
  if (requiereCuit && tipo !== 'cuit' && tipo !== 'cuil') {
    return socio.facturaFiscal
      ? 'La condición frente al IVA en Datos Personales requiere CUIT/CUIL, pero el documento cargado es otro. Revisá los datos del socio.'
      : 'La condición IVA del socio requiere tipo de documento CUIT/CUIL. Actualizá los Datos Impositivos del socio.';
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
      cuit: profiles.cuit,
      direccion: profiles.direccion,
      direccionFiscal: profiles.direccionFiscal,
      condicionIva: profiles.condicionIva,
      condicionIvaPersonal: profiles.condicionIvaPersonal,
      emailFacturacion: profiles.emailFacturacion,
      facturaFiscal: memberships.facturaFiscal,
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
  const validacionSocio = validarDocumentoSocio(socio);
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
      certificadoAfipOk: guarderias.certificadoAfipOk,
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
        'Esta guardería todavía no tiene los datos impositivos configurados. Andá a Mi perfil → Datos Impositivos y completá los datos antes de facturar.',
    };
  }

  if (!guarderia.certificadoAfipOk) {
    return {
      error:
        'El certificado de enlace con AFIP todavía no está confirmado. Andá a Mi perfil → Datos Impositivos, solicitá el certificado y confirmá la instalación antes de emitir facturas.',
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
    idioma: 1,
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
      error: err instanceof Error ? err.message : 'Error al emitir factura en TusFacturas.',
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
      cae: apiResponse.cae ?? null,
      descripcion: descripcionFactura,
      tipoFactura: data.tipoFactura,
      estado: estadoFactura,
      condicionVenta: data.condicionVenta,
      medioPago: data.medioPago,
      importe: total.toFixed(2),
      emision: fechaCalendariaArg(data.fecha),
      desde: fechaCalendariaArg(data.desde),
      hasta: fechaCalendariaArg(data.hasta),
      vencimiento: fechaCalendariaArg(data.vencimiento),
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

  if (!data.socioMovimientos.length) return { error: 'Seleccioná al menos un socio.' };

  // Validar que la fecha no sea más de 5 días atrás.
  const fechaDate = new Date(data.fecha + 'T00:00:00');
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const diff = Math.floor((hoy.getTime() - fechaDate.getTime()) / 86400000);
  if (diff > 5) return { error: 'La fecha no puede ser más de 5 días anterior a hoy.' };

  // Calcular vencimiento y período a partir de la fecha.
  const vencimiento = data.fecha;
  const [year, month] = data.fecha.split('-').map(Number);
  const desde = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const hasta = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const gId = ctx.activeMembership.guarderiaId;
  const socioIds = data.socioMovimientos.map((s) => s.socioId);

  // Traer condicionIva de la guardería
  const [gInfo] = await db
    .select({ condicionIva: guarderias.condicionIva })
    .from(guarderias)
    .where(eq(guarderias.id, gId))
    .limit(1);
  const guarderiaCondicion = gInfo?.condicionIva ?? null;

  // Verificar que los socios pertenezcan a esta guardería
  const validos = await db
    .select({ userId: memberships.userId, condicionIva: profiles.condicionIva })
    .from(memberships)
    .innerJoin(profiles, eq(profiles.id, memberships.userId))
    .where(
      and(
        inArray(memberships.userId, socioIds),
        eq(memberships.guarderiaId, gId),
        eq(memberships.status, 'active'),
      ),
    );
  const validSocioMap = new Map(validos.map((v) => [v.userId, v.condicionIva]));

  const result: BatchResult = { succeeded: [], skipped: [], failed: [] };

  for (const { socioId, movimientoIds } of data.socioMovimientos) {
    if (!validSocioMap.has(socioId)) {
      result.skipped.push({ socioId, reason: 'Socio fuera de la guardería activa' });
      continue;
    }
    if (!movimientoIds.length) {
      result.skipped.push({ socioId, reason: 'Sin movimientos seleccionados' });
      continue;
    }

    const tipoFactura = derivarTipoFactura(guarderiaCondicion, validSocioMap.get(socioId) ?? null);

    const res = await createInvoiceAction({
      socioId,
      tipoFactura,
      condicionVenta: 'contado',
      medioPago: data.medioPago,
      fecha: data.fecha,
      vencimiento,
      desde,
      hasta,
      movimientoIds,
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

// ─── Action: crear recibo interno ─────────────────────────────────────────────

export type CreateReciboInternoData = {
  socioId: string;
  movimientoId: string;
  importe: string;
  descripcion: string;
  medioPago: string;
  fecha?: string;
};

export async function crearReciboInternoAction(
  data: CreateReciboInternoData,
): Promise<{ id?: string; error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };

  const gId = ctx.activeMembership.guarderiaId;

  try {
    const id = randomUUID();
    const codigo = `RCP-${id.slice(-6).toUpperCase()}`;
    const emision = data.fecha ? fechaCalendariaArg(data.fecha) : new Date();

    await db.insert(facturacion).values({
      id,
      guarderiaId: gId,
      socioId: data.socioId,
      tipoFactura: 'recibo',
      estado: 'pagada',
      importe: data.importe,
      descripcion: data.descripcion,
      medioPago: data.medioPago as MedioPago,
      emision,
      movimientoId: data.movimientoId,
      codigo,
    });

    revalidatePath('/facturacion');
    revalidatePath(`/usuarios/${data.socioId}`);
    return { id };
  } catch {
    return { error: 'Error al crear el comprobante interno.' };
  }
}

// ─── Action: emitir nota de crédito ───────────────────────────────────────────

export type EmitirNcMotivo = 'anulacion_total' | 'descuento_parcial' | 'devolucion_servicio';

export type EmitirNcData = {
  facturaOriginalId: string;
  motivo: EmitirNcMotivo;
  /** Requerido si motivo !== 'anulacion_total'. */
  importe?: number;
  descripcion?: string;
};

export type EmitirNcResult = {
  error?: string;
  ncId?: string;
  comprobanteNro?: string;
  pdfUrl?: string;
};

export async function emitirNotaCreditoAction(data: EmitirNcData): Promise<EmitirNcResult> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };

  const gId = ctx.activeMembership.guarderiaId;

  // 1. Cargar la factura original (validando scope)
  const [original] = await db
    .select({
      id: facturacion.id,
      tipoFactura: facturacion.tipoFactura,
      codigo: facturacion.codigo,
      cae: facturacion.cae,
      emision: facturacion.emision,
      importe: facturacion.importe,
      socioId: facturacion.socioId,
      condicionVenta: facturacion.condicionVenta,
    })
    .from(facturacion)
    .where(and(eq(facturacion.id, data.facturaOriginalId), eq(facturacion.guarderiaId, gId)))
    .limit(1);

  if (!original) return { error: 'Factura no encontrada.' };

  const tipoOriginal = original.tipoFactura;
  if (
    tipoOriginal !== 'factura_a' &&
    tipoOriginal !== 'factura_b' &&
    tipoOriginal !== 'factura_c'
  ) {
    return { error: 'Solo se puede emitir NC sobre facturas AFIP (A, B o C).' };
  }

  if (!original.cae) {
    return {
      error:
        'Esta factura no tiene CAE registrado. Solo se pueden emitir NC sobre facturas emitidas desde este sistema.',
    };
  }

  if (!original.codigo) return { error: 'La factura no tiene número de comprobante.' };

  // Parsear "PPPPP-NNNNNNNN" → punto_venta y numero
  const [puntoVentaStr, numeroStr] = original.codigo.split('-');
  if (!puntoVentaStr || !numeroStr) {
    return { error: 'El número de comprobante tiene formato inesperado.' };
  }

  // 2. Determinar importe de la NC
  const importeOriginal = parseFloat(original.importe ?? '0');
  let ncImporte: number;
  if (data.motivo === 'anulacion_total') {
    ncImporte = importeOriginal;
  } else {
    if (!data.importe || data.importe <= 0) {
      return { error: 'Ingresá el importe de la nota de crédito.' };
    }
    if (data.importe > importeOriginal) {
      return { error: 'El importe de la NC no puede superar el total de la factura original.' };
    }
    ncImporte = data.importe;
  }

  // 3. Cargar socio y creds de guardería
  const [socio] = await db
    .select({
      id: profiles.id,
      email: profiles.email,
      nombre: profiles.nombre,
      apellido: profiles.apellido,
      razonSocial: profiles.razonSocial,
      tipoDocumento: profiles.tipoDocumento,
      numeroDocumento: profiles.numeroDocumento,
      cuit: profiles.cuit,
      direccion: profiles.direccion,
      direccionFiscal: profiles.direccionFiscal,
      condicionIva: profiles.condicionIva,
      condicionIvaPersonal: profiles.condicionIvaPersonal,
      emailFacturacion: profiles.emailFacturacion,
      facturaFiscal: memberships.facturaFiscal,
    })
    .from(profiles)
    .innerJoin(
      memberships,
      and(eq(memberships.userId, profiles.id), eq(memberships.guarderiaId, gId)),
    )
    .where(eq(profiles.id, original.socioId!))
    .limit(1);

  if (!socio) return { error: 'No se encontró el socio de la factura original.' };

  const [guarderia] = await db
    .select({
      puntoDeVenta: guarderias.puntoDeVenta,
      cuit: guarderias.cuit,
      rubro: guarderias.rubro,
      tusfacturasApikey: guarderias.tusfacturasApikey,
      tusfacturasApitoken: guarderias.tusfacturasApitoken,
      tusfacturasUsertoken: guarderias.tusfacturasUsertoken,
    })
    .from(guarderias)
    .where(eq(guarderias.id, gId))
    .limit(1);

  if (
    !guarderia?.puntoDeVenta ||
    !guarderia.tusfacturasApikey ||
    !guarderia.tusfacturasApitoken ||
    !guarderia.tusfacturasUsertoken
  ) {
    return { error: 'Faltan datos de facturación de la guardería.' };
  }

  const credsOverride: TusFacturasCredentials = {
    apikey: guarderia.tusfacturasApikey,
    apitoken: guarderia.tusfacturasApitoken,
    usertoken: guarderia.tusfacturasUsertoken,
  };

  // 4. Construir payload NC
  const ncId = randomUUID();
  const hoy = toTusFecha(new Date());
  const condVenta = (original.condicionVenta ?? 'contado') as CondicionVenta;
  const cliente = buildCliente({ ...socio, condicionVenta: condVenta });

  const MOTIVO_LABEL: Record<EmitirNcMotivo, string> = {
    anulacion_total: 'Anulación total',
    descuento_parcial: 'Descuento parcial',
    devolucion_servicio: 'Devolución de servicio',
  };

  const descripcionNc =
    data.descripcion?.trim() ||
    `NC — ${MOTIVO_LABEL[data.motivo]} de comprobante ${original.codigo}`;

  const asociado: TusFacturasComprobanteAsociado = {
    tipo_comprobante: TIPO_FACTURA_API[tipoOriginal],
    punto_venta: puntoVentaStr,
    numero: numeroStr,
    comprobante_fecha: toTusFecha(original.emision),
    cuit: (guarderia.cuit ?? '').replace(/[-\s]/g, ''),
  };

  const ncComprobante: TusFacturasComprobante = {
    fecha: hoy,
    vencimiento: hoy,
    tipo: TIPO_NC_API[tipoOriginal],
    idioma: 1,
    external_reference: ncId,
    operacion: 'V',
    punto_venta: String(guarderia.puntoDeVenta),
    moneda: 'PES',
    cotizacion: 1,
    periodo_facturado_desde: hoy,
    periodo_facturado_hasta: hoy,
    rubro: guarderia.rubro ?? 'Servicios náuticos',
    rubro_grupo_contable: process.env.TUSFACTURAS_RUBRO_GRUPO ?? 'Servicios',
    detalle: buildDetalle(
      [{ descripcion: descripcionNc, cantidad: 1, importeUnitario: ncImporte }],
      tipoOriginal,
    ),
    total: ncImporte.toFixed(2),
    pagos: {
      formas_pago: [{ descripcion: 'Nota de crédito', importe: ncImporte }],
      total: ncImporte,
    },
    comprobantes_asociados: [asociado],
  };

  let apiResponse;
  try {
    apiResponse = await crearFactura({ cliente, comprobante: ncComprobante }, credsOverride);
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error al emitir la NC en TusFacturas.' };
  }

  // 5. Persistir NC + movimiento de crédito
  try {
    const ncTipoFactura = NC_TIPO_FACTURA[tipoOriginal] as
      | 'nota_credito_a'
      | 'nota_credito_b'
      | 'nota_credito_c';

    await db.insert(facturacion).values({
      id: ncId,
      guarderiaId: gId,
      socioId: original.socioId,
      tipoFactura: ncTipoFactura,
      estado: 'pagada',
      codigo: apiResponse.comprobante_nro ?? null,
      archivo: apiResponse.comprobante_pdf_url ?? null,
      cae: apiResponse.cae ?? null,
      descripcion: descripcionNc,
      importe: ncImporte.toFixed(2),
      emision: new Date(),
      externalReference: ncId,
      facturaOriginalId: data.facturaOriginalId,
    });

    // Crear movimiento de crédito para ajustar saldo
    if (original.socioId) {
      await db.insert(movimientosCuentaCorriente).values({
        socioId: original.socioId,
        concepto: descripcionNc,
        tipo: 'otro',
        estado: 'pagado',
        debe: '0',
        haber: ncImporte.toFixed(2),
        importeSigned: `-${ncImporte.toFixed(2)}`,
        fecha: new Date(),
        createdBy: ctx.user.id,
      });
    }

    revalidatePath('/facturacion');
    if (original.socioId) revalidatePath(`/usuarios/${original.socioId}`);

    return {
      ncId,
      comprobanteNro: apiResponse.comprobante_nro,
      pdfUrl: apiResponse.comprobante_pdf_url,
    };
  } catch (err) {
    console.error('NC emitida en TusFacturas pero falló persistencia', {
      comprobanteNro: apiResponse.comprobante_nro,
      err,
    });
    return {
      error:
        'La NC se emitió en AFIP pero no se pudo guardar. Contactá al administrador con el número ' +
        (apiResponse.comprobante_nro ?? ncId),
    };
  }
}

// ─── Action: ventanilla — consumo + factura en un paso ────────────────────────

export type VentanillaItem = {
  descripcion: string;
  cantidad: number;
  importeUnitario: number;
};

export type VentanillaData = {
  socioId: string;
  tipoFactura: TipoFactura;
  condicionVenta: CondicionVenta;
  medioPago: MedioPago;
  fecha: string;
  vencimiento: string;
  items: VentanillaItem[];
};

export async function ventanillaEmitirFacturaAction(data: VentanillaData): Promise<FacturaResult> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };

  const gId = ctx.activeMembership.guarderiaId;

  if (!data.items || data.items.length === 0) return { error: 'Ingresá al menos un ítem.' };

  // Verificar que el socio pertenece a esta guardería
  const [membership] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, data.socioId),
        eq(memberships.guarderiaId, gId),
        eq(memberships.status, 'active'),
      ),
    );
  if (!membership) return { error: 'El socio no pertenece a esta guardería.' };

  // Crear los movimientos primero
  const movimientoIds: string[] = [];
  for (const item of data.items) {
    const importe = (item.cantidad * item.importeUnitario).toFixed(2);
    const [inserted] = await db
      .insert(movimientosCuentaCorriente)
      .values({
        socioId: data.socioId,
        concepto: item.descripcion,
        tipo: 'otro',
        estado: 'no_pagado',
        debe: importe,
        haber: '0',
        importeSigned: importe,
        fecha: fechaCalendariaArg(data.fecha),
        createdBy: ctx.user.id,
      })
      .returning({ id: movimientosCuentaCorriente.id });
    movimientoIds.push(inserted.id);
  }

  // Emitir la factura linkando los movimientos recién creados
  const result = await crearFacturaCore({
    ...data,
    guarderiaId: gId,
    desde: data.fecha,
    hasta: data.fecha,
    movimientoIds,
  });

  // Si la factura falló, limpiar los movimientos creados
  if (result.error) {
    await db
      .delete(movimientosCuentaCorriente)
      .where(inArray(movimientosCuentaCorriente.id, movimientoIds));
  }

  return result;
}
