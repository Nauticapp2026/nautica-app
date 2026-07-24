'use server';

import { revalidatePath } from 'next/cache';
import { and, asc, count, eq, inArray, like, ne } from 'drizzle-orm';
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
  servicios,
} from '@/lib/db/schema';
import { getActiveMarina } from '@/lib/auth/session';
import { fechaCalendariaArg } from '@/lib/dates';
import { sendEmail } from '@/lib/email/resend';
import { reciboEmail } from '@/lib/email/templates/recibo';
import { identidadFacturacion, type SocioFacturacion } from '@/lib/facturacion/identidad';
import { getCargosSaldadosFifo } from '@/lib/reconciliar-cuenta';
import { crearSocioServicio, hayContratoVigente } from '@/lib/socio-servicios';
import { MOTIVO_NOTA_LABEL, type MotivoNota } from './nota-constants';
import { CATEGORIA_SERVICIO_LABEL } from './categoria-constants';
import {
  consultarComprobante,
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
  ND_TIPO_FACTURA,
  TIPO_DB_API,
  TIPO_DOC_API,
  TIPO_FACTURA_API,
  TIPO_NC_API,
  TIPO_ND_API,
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

// Alícuota de fallback para ítems que no vienen de un servicio del tarifario
// (notas de crédito, items libres) — no hay de dónde leer la
// alícuota real, así que se asume el default histórico.
function alicuotaPara(tipo: TipoFactura): string {
  // Factura C (Monotributo) → sin IVA discriminado
  return tipo === 'factura_c' ? '0' : '21';
}

function precioSinIva(total: number, alicuota: string): number {
  const a = parseFloat(alicuota);
  if (!a) return total;
  return +(total / (1 + a / 100)).toFixed(2);
}

// Prefija la categoría del servicio (Cuota social, Espacio de guarda, etc.)
// al concepto del cargo, para que quede visible en el detalle/ítem que se
// manda a ARCA. `tipo` es null en cargos libres ("Cargar consumo" sin
// servicio del tarifario) — ahí no hay categoría que anteponer.
function descripcionConCategoria(concepto: string | null, tipo: string | null): string {
  const base = concepto ?? 'Servicio';
  const categoria = tipo ? CATEGORIA_SERVICIO_LABEL[tipo] : null;
  return categoria ? `${categoria} — ${base}` : base;
}

/**
 * Desglosa el total de una lista de ítems (cada `importeUnitario` ya viene
 * con IVA incluido, como se cobra al socio) en neto/exento/IVA, para
 * mostrar en la tabla de Ventas. Un ítem sin alícuota propia usa
 * `fallbackAlicuota` (mismo default que ya usa `alicuotaPara` al armar el
 * detalle de TusFacturas). Alícuota 0 → todo el ítem es "exento", no neto.
 */
function desglosarMontos(
  items: { importeUnitario: number; cantidad: number; alicuotaIva?: number | null }[],
  fallbackAlicuota: string,
): { montoNeto: number; montoExento: number; montoIva: number } {
  let montoNeto = 0;
  let montoExento = 0;
  let montoIva = 0;
  for (const it of items) {
    const total = it.importeUnitario * it.cantidad;
    const alicuota = it.alicuotaIva != null ? String(it.alicuotaIva) : fallbackAlicuota;
    if (parseFloat(alicuota) === 0) {
      montoExento += total;
    } else {
      const neto = precioSinIva(total, alicuota);
      montoNeto += neto;
      montoIva += total - neto;
    }
  }
  return {
    montoNeto: +montoNeto.toFixed(2),
    montoExento: +montoExento.toFixed(2),
    montoIva: +montoIva.toFixed(2),
  };
}

/**
 * Inverso de `toTusFecha`: TusFacturas devuelve "DD/MM/YYYY". Devuelve
 * "YYYY-MM-DD" (las columnas `date` de este esquema van como string, no
 * como `Date` — mismo criterio que `vigenciaDesde`/`fechaInicio`, etc.).
 */
function parseTusFecha(fecha: string | undefined | null): string | null {
  if (!fecha) return null;
  const [d, m, y] = fecha.split('/');
  if (!d || !m || !y) return null;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

// Identificación interna correlativa por guardería, que se suma al número
// que devuelve ARCA: "FM-NNNNNN" para Facturación manual (y su NC), "FL-NNNNNN"
// para Facturación por lote (y su NC), "FA-NNNNNN" para la auto-facturación
// del cron. No aplica a recibos internos "RB-".
async function nextFolioLocal(gId: string, prefix: 'FM' | 'FL' | 'FA'): Promise<string> {
  const [{ n }] = await db
    .select({ n: count() })
    .from(facturacion)
    .where(and(eq(facturacion.guarderiaId, gId), like(facturacion.folioLocal, `${prefix}-%`)));
  return `${prefix}-${String(Number(n) + 1).padStart(6, '0')}`;
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
  items: {
    descripcion: string;
    cantidad: number;
    importeUnitario: number;
    alicuotaIva?: number | null;
  }[],
  tipo: TipoFactura,
): TusFacturasDetalleItem[] {
  const alicuotaDefault = alicuotaPara(tipo);
  return items.map((it) => {
    // Factura C nunca discrimina IVA (requisito AFIP), sea cual sea la
    // alícuota real del servicio. Para A/B usamos la alícuota real del
    // servicio si la conocemos; si no (ítem libre), el default.
    const alicuota = tipo === 'factura_c' ? '0' : (it.alicuotaIva?.toFixed(2) ?? alicuotaDefault);
    return {
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
    };
  });
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
  folioLocal?: string;
  pdfUrl?: string;
};

export async function createInvoiceAction(
  data: CreateInvoiceData,
  opts?: { folioPrefix?: 'FM' | 'FL' },
): Promise<FacturaResult> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  return crearFacturaCore(
    { ...data, guarderiaId: ctx.activeMembership.guarderiaId },
    { folioPrefix: opts?.folioPrefix ?? 'FM' },
  );
}

/**
 * Core de emisión de factura, sin chequeo de sesión. Llamable desde:
 * - createInvoiceAction (manual, con auth) → folio local "FM-NNNNNN"
 * - createInvoiceAction desde el lote → folio local "FL-NNNNNN"
 * - cron de auto-facturación (sin auth, recibe guarderiaId) → folio local "FA-NNNNNN"
 */
export async function crearFacturaCore(
  data: CreateInvoiceData & { guarderiaId: string },
  opts?: { folioPrefix?: 'FM' | 'FL' | 'FA' },
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
        'El certificado de enlace con ARCA todavía no está confirmado. Andá a Mi perfil → Datos Impositivos, solicitá el certificado y confirmá la instalación antes de emitir facturas.',
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
  let items: {
    descripcion: string;
    cantidad: number;
    importeUnitario: number;
    alicuotaIva?: number | null;
  }[] = [];
  let movimientoIds = data.movimientoIds ?? [];

  if (movimientoIds.length > 0) {
    const movs = await db
      .select({
        id: movimientosCuentaCorriente.id,
        concepto: movimientosCuentaCorriente.concepto,
        debe: movimientosCuentaCorriente.debe,
        comprobanteInterno: movimientosCuentaCorriente.comprobanteInterno,
        // Alícuota real del servicio del cargo (si lo tiene) para no asumir
        // 21% en servicios Exentos o al 10,5%. Null si el cargo es libre
        // ("Cargar consumo" sin servicio) — se usa el default.
        servicioAlicuotaIva: servicios.alicuotaIva,
        servicioTipo: servicios.tipo,
      })
      .from(movimientosCuentaCorriente)
      .leftJoin(servicios, eq(servicios.id, movimientosCuentaCorriente.servicioId))
      .where(
        and(
          inArray(movimientosCuentaCorriente.id, movimientoIds),
          eq(movimientosCuentaCorriente.socioId, data.socioId),
        ),
      );

    // Guard duro: un cargo con comprobante interno NO se factura (no va por
    // TusFacturas). Las listas ya lo ocultan, pero el id podría llegar igual;
    // acá se rechaza del lado del server.
    if (movs.some((m) => m.comprobanteInterno)) {
      return { error: 'No se puede facturar un cargo con comprobante interno.' };
    }

    // Guard duro: un cargo ya cubierto por el pool de haberes (FIFO) — aunque
    // su `estado` todavía diga 'no_pagado', por ej. un cobro Payway que no
    // llegó a reconciliarse — no se vuelve a facturar. Mismo criterio que ya
    // usa auto-facturacion.ts; acá faltaba en el camino manual/lote.
    const saldados = await getCargosSaldadosFifo(data.socioId);
    if (movs.some((m) => saldados.has(m.id))) {
      return {
        error:
          'Uno o más cargos ya están cubiertos por un pago y no se pueden facturar. Actualizá la página.',
      };
    }

    items = movs.map((m) => ({
      descripcion: descripcionConCategoria(m.concepto, m.servicioTipo),
      cantidad: 1,
      importeUnitario: parseFloat(m.debe ?? '0'),
      alicuotaIva: m.servicioAlicuotaIva != null ? Number(m.servicioAlicuotaIva) : null,
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

  const descripcionFactura =
    data.descripcion?.trim() ||
    `Factura ${TIPO_FACTURA_API[data.tipoFactura]} — ${items[0].descripcion}${
      items.length > 1 ? ` (+${items.length - 1})` : ''
    }`;
  const montos = desglosarMontos(items, alicuotaPara(data.tipoFactura));

  let apiResponse;
  try {
    apiResponse = await crearFactura({ cliente, comprobante }, credsOverride);
  } catch (err) {
    const motivoError =
      err instanceof Error ? err.message : 'Error al emitir factura en TusFacturas.';
    // ARCA rechazó el comprobante: se guarda igual (sin folioLocal/codigo/cae)
    // para poder mostrarlo en Ventas y reenviarlo corregido, en vez de perder
    // el intento. Los cargos quedan "facturado" — tomados por este intento,
    // no disponibles para facturarse por otro lado hasta reenviar y resolver.
    try {
      await db.insert(facturacion).values({
        id: facturaId,
        guarderiaId: gId,
        socioId: data.socioId,
        descripcion: descripcionFactura,
        tipoFactura: data.tipoFactura,
        estado: data.estado ?? 'pendiente',
        condicionVenta: data.condicionVenta,
        medioPago: data.medioPago,
        importe: total.toFixed(2),
        montoNeto: montos.montoNeto.toFixed(2),
        montoExento: montos.montoExento.toFixed(2),
        montoIva: montos.montoIva.toFixed(2),
        emision: fechaCalendariaArg(data.fecha),
        desde: fechaCalendariaArg(data.desde),
        hasta: fechaCalendariaArg(data.hasta),
        vencimiento: fechaCalendariaArg(data.vencimiento),
        externalReference: facturaId,
        rechazada: true,
        motivoError,
      });

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
        await db
          .update(movimientosCuentaCorriente)
          .set({ estado: 'facturado' })
          .where(inArray(movimientosCuentaCorriente.id, movimientoIds));
      }

      revalidatePath('/ventas');
      revalidatePath(`/usuarios/${data.socioId}`);
    } catch (persistErr) {
      console.error('No se pudo guardar la factura rechazada', { facturaId, persistErr });
    }

    return { error: motivoError, facturaId };
  }

  // 5. Persistir factura + items + linkear movimientos
  try {
    const estadoFactura = data.estado ?? 'pendiente';
    const folioLocal = opts?.folioPrefix ? await nextFolioLocal(gId, opts.folioPrefix) : null;

    await db.insert(facturacion).values({
      id: facturaId,
      guarderiaId: gId,
      socioId: data.socioId,
      codigo: apiResponse.comprobante_nro ?? null,
      folioLocal,
      archivo: apiResponse.comprobante_pdf_url ?? null,
      cae: apiResponse.cae ?? null,
      caeVencimiento: parseTusFecha(apiResponse.vencimiento_cae),
      descripcion: descripcionFactura,
      tipoFactura: data.tipoFactura,
      estado: estadoFactura,
      condicionVenta: data.condicionVenta,
      medioPago: data.medioPago,
      importe: total.toFixed(2),
      montoNeto: montos.montoNeto.toFixed(2),
      montoExento: montos.montoExento.toFixed(2),
      montoIva: montos.montoIva.toFixed(2),
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

    revalidatePath('/ventas');
    revalidatePath(`/usuarios/${data.socioId}`);

    return {
      facturaId,
      comprobanteNro: apiResponse.comprobante_nro,
      folioLocal: folioLocal ?? undefined,
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
        'La factura se emitió en ARCA pero no se pudo guardar. Contactá al administrador con el número ' +
        (apiResponse.comprobante_nro ?? facturaId),
    };
  }
}

// ─── Action: reenviar una factura rechazada por ARCA ──────────────────────

export type ReenviarFacturaData = {
  tipoFactura: TipoFactura;
  condicionVenta: CondicionVenta;
  medioPago: MedioPago;
  descripcion?: string;
  fecha: string;
  vencimiento: string;
};

/**
 * Corrige y reenvía una factura que quedó `rechazada` (ver el catch de
 * `crearFacturaCore`). Los cargos NO se vuelven a elegir — son los mismos
 * que ya quedaron linkeados (y en estado 'facturado') en el intento
 * original; lo único editable es tipo/condición de venta/medio de
 * pago/descripción/fecha, para que el admin pueda corregir lo que haya
 * indicado el motivo del rechazo (o corregir el socio aparte y reenviar
 * tal cual — el cliente se reconstruye con los datos frescos del socio).
 */
export async function reenviarFacturaRechazadaAction(
  facturaId: string,
  data: ReenviarFacturaData,
): Promise<FacturaResult> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  const gId = ctx.activeMembership.guarderiaId;

  const [rechazada] = await db
    .select({
      id: facturacion.id,
      socioId: facturacion.socioId,
      rechazada: facturacion.rechazada,
      desde: facturacion.desde,
      hasta: facturacion.hasta,
    })
    .from(facturacion)
    .where(and(eq(facturacion.id, facturaId), eq(facturacion.guarderiaId, gId)))
    .limit(1);

  if (!rechazada) return { error: 'Factura no encontrada.' };
  if (!rechazada.rechazada) return { error: 'Esta factura no está rechazada.' };
  if (!rechazada.socioId) return { error: 'La factura no tiene socio asociado.' };

  // Cargos ya linkeados al intento original — no se vuelven a elegir.
  const items = await db
    .select({ id: facturacionItems.id })
    .from(facturacionItems)
    .where(eq(facturacionItems.facturacionId, facturaId));

  const links = items.length
    ? await db
        .select({ movimientoId: facturacionItemMovimientos.movimientoId })
        .from(facturacionItemMovimientos)
        .where(
          inArray(
            facturacionItemMovimientos.facturacionItemId,
            items.map((i) => i.id),
          ),
        )
    : [];

  const movimientoIds = links.map((l) => l.movimientoId);
  if (movimientoIds.length === 0) {
    return { error: 'No se encontraron los cargos de esta factura.' };
  }

  const movs = await db
    .select({
      concepto: movimientosCuentaCorriente.concepto,
      debe: movimientosCuentaCorriente.debe,
      servicioAlicuotaIva: servicios.alicuotaIva,
      servicioTipo: servicios.tipo,
    })
    .from(movimientosCuentaCorriente)
    .leftJoin(servicios, eq(servicios.id, movimientosCuentaCorriente.servicioId))
    .where(inArray(movimientosCuentaCorriente.id, movimientoIds));

  const detalleItems = movs.map((m) => ({
    descripcion: descripcionConCategoria(m.concepto, m.servicioTipo),
    cantidad: 1,
    importeUnitario: parseFloat(m.debe ?? '0'),
    alicuotaIva: m.servicioAlicuotaIva != null ? Number(m.servicioAlicuotaIva) : null,
  }));
  const total = totalItems(detalleItems);

  // Socio y credenciales frescos: si el motivo del rechazo era un dato del
  // socio (CUIT, condición de IVA), esto ya recoge la corrección.
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
    .where(and(eq(profiles.id, rechazada.socioId), eq(memberships.status, 'active')));

  if (!socio) return { error: 'Socio no encontrado en esta guardería.' };

  const validacionSocio = validarDocumentoSocio(socio);
  if (validacionSocio) return { error: validacionSocio };

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
    return { error: 'Esta guardería todavía no tiene los datos impositivos configurados.' };
  }
  if (!guarderia.certificadoAfipOk) {
    return { error: 'El certificado de enlace con ARCA todavía no está confirmado.' };
  }

  const credsOverride: TusFacturasCredentials = {
    apikey: guarderia.tusfacturasApikey,
    apitoken: guarderia.tusfacturasApitoken,
    usertoken: guarderia.tusfacturasUsertoken,
  };

  const cliente = buildCliente({ ...socio, condicionVenta: data.condicionVenta });
  const comprobante: TusFacturasComprobante = {
    fecha: toTusFecha(data.fecha),
    vencimiento: toTusFecha(data.vencimiento),
    tipo: TIPO_FACTURA_API[data.tipoFactura],
    idioma: 1,
    external_reference: facturaId,
    operacion: 'V',
    punto_venta: String(guarderia.puntoDeVenta),
    moneda: 'PES',
    cotizacion: 1,
    periodo_facturado_desde: toTusFecha(rechazada.desde ?? fechaCalendariaArg(data.fecha)),
    periodo_facturado_hasta: toTusFecha(rechazada.hasta ?? fechaCalendariaArg(data.fecha)),
    rubro: guarderia.rubro ?? 'Servicios náuticos',
    rubro_grupo_contable: process.env.TUSFACTURAS_RUBRO_GRUPO ?? 'Servicios',
    detalle: buildDetalle(detalleItems, data.tipoFactura),
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
    const motivoError =
      err instanceof Error ? err.message : 'Error al emitir factura en TusFacturas.';
    await db
      .update(facturacion)
      .set({ motivoError, updatedAt: new Date() })
      .where(eq(facturacion.id, facturaId));
    return { error: motivoError, facturaId };
  }

  // Reenvío exitoso: recién ahora se asigna folio local (siempre FM — el
  // reenvío siempre es una corrección manual, sea cual sea el origen del
  // intento original) y se limpia el rechazo.
  const descripcionFactura =
    data.descripcion?.trim() ||
    `Factura ${TIPO_FACTURA_API[data.tipoFactura]} — ${detalleItems[0].descripcion}${
      detalleItems.length > 1 ? ` (+${detalleItems.length - 1})` : ''
    }`;
  const folioLocal = await nextFolioLocal(gId, 'FM');
  const montos = desglosarMontos(detalleItems, alicuotaPara(data.tipoFactura));

  await db
    .update(facturacion)
    .set({
      codigo: apiResponse.comprobante_nro ?? null,
      folioLocal,
      archivo: apiResponse.comprobante_pdf_url ?? null,
      cae: apiResponse.cae ?? null,
      caeVencimiento: parseTusFecha(apiResponse.vencimiento_cae),
      descripcion: descripcionFactura,
      tipoFactura: data.tipoFactura,
      condicionVenta: data.condicionVenta,
      medioPago: data.medioPago,
      importe: total.toFixed(2),
      montoNeto: montos.montoNeto.toFixed(2),
      montoExento: montos.montoExento.toFixed(2),
      montoIva: montos.montoIva.toFixed(2),
      emision: fechaCalendariaArg(data.fecha),
      vencimiento: fechaCalendariaArg(data.vencimiento),
      rechazada: false,
      motivoError: null,
      updatedAt: new Date(),
    })
    .where(eq(facturacion.id, facturaId));

  revalidatePath('/ventas');
  revalidatePath(`/usuarios/${rechazada.socioId}`);

  return {
    facturaId,
    comprobanteNro: apiResponse.comprobante_nro,
    folioLocal,
    pdfUrl: apiResponse.comprobante_pdf_url,
  };
}

// ─── Action: factura en lote ────────────────────────────────────────────────

export type BatchResult = {
  succeeded: { socioId: string; facturaId: string; comprobanteNro?: string; folioLocal?: string }[];
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

    const res = await createInvoiceAction(
      {
        socioId,
        tipoFactura,
        condicionVenta: 'contado',
        medioPago: data.medioPago,
        fecha: data.fecha,
        vencimiento,
        desde,
        hasta,
        movimientoIds,
      },
      { folioPrefix: 'FL' },
    );

    if (res.error) {
      result.failed.push({ socioId, error: res.error });
    } else if (res.facturaId) {
      result.succeeded.push({
        socioId,
        facturaId: res.facturaId,
        comprobanteNro: res.comprobanteNro,
        folioLocal: res.folioLocal,
      });
    }
  }

  revalidatePath('/ventas');
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
        // Excluir cargos con comprobante interno: no se facturan por TusFacturas.
        eq(movimientosCuentaCorriente.comprobanteInterno, false),
      ),
    )
    .orderBy(movimientosCuentaCorriente.fecha);

  // Excluir cargos ya cubiertos por el pool de haberes (FIFO) aunque su
  // `estado` todavía diga 'no_pagado' — mismo criterio que auto-facturación,
  // para no ofrecer para facturar algo que un cobro Payway ya saldó en neto.
  const saldados = await getCargosSaldadosFifo(socioId);
  const pendientes = rows.filter((r) => !saldados.has(r.id));

  return {
    movimientos: pendientes.map((r) => ({
      id: r.id,
      fecha: r.fecha ? r.fecha.toISOString() : null,
      concepto: r.concepto,
      debe: r.debe ?? '0',
    })),
  };
}

// ─── Action: link fresco del PDF de un comprobante ARCA ─────────────────────
// El `archivo` que guardamos al emitir es una URL temporal de TusFacturas:
// al tiempo vence y su página muestra "no se ha encontrado información
// asociada a tu búsqueda". Este action consulta el comprobante en TusFacturas
// (no consume requests del plan) y devuelve un link recién generado.

export async function obtenerPdfFacturaAction(
  facturaId: string,
): Promise<{ error?: string; url?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  const gId = ctx.activeMembership.guarderiaId;

  const [f] = await db
    .select({
      codigo: facturacion.codigo,
      tipoFactura: facturacion.tipoFactura,
    })
    .from(facturacion)
    .where(and(eq(facturacion.id, facturaId), eq(facturacion.guarderiaId, gId)))
    .limit(1);
  if (!f) return { error: 'Comprobante no encontrado.' };

  const tipoApi = TIPO_DB_API[f.tipoFactura ?? ''];
  if (!tipoApi) return { error: 'Este comprobante no es fiscal — no tiene PDF de ARCA.' };
  // codigo = comprobante_nro de TusFacturas, formato "PPPPP-NNNNNNNN".
  const [pv, nro] = (f.codigo ?? '').split('-');
  if (!pv || !nro) {
    return { error: 'Este comprobante no tiene número de ARCA (puede haber quedado rechazado).' };
  }

  const credsData = await cargarCredsGuarderia(gId);
  if (!credsData) return { error: 'Faltan las credenciales de TusFacturas de la guardería.' };

  try {
    const rta = await consultarComprobante(
      {
        tipo: tipoApi,
        punto_venta: String(parseInt(pv, 10)),
        numero: String(parseInt(nro, 10)),
      },
      credsData.creds,
    );
    if (!rta.comprobante_pdf_url) {
      return { error: 'TusFacturas no devolvió el PDF de este comprobante.' };
    }

    // Refrescar el link guardado, así queda el más nuevo disponible.
    await db
      .update(facturacion)
      .set({ archivo: rta.comprobante_pdf_url })
      .where(eq(facturacion.id, facturaId));

    return { url: rta.comprobante_pdf_url };
  } catch (err) {
    console.error('[obtenerPdfFacturaAction]', facturaId, err);
    return {
      error: err instanceof Error ? err.message : 'No se pudo obtener el PDF del comprobante.',
    };
  }
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

    revalidatePath('/ventas');
    if (updated.socioId) revalidatePath(`/usuarios/${updated.socioId}`);
    return {};
  } catch {
    return { error: 'Error al actualizar la factura.' };
  }
}

// ─── Action: cargar servicio (con comprobante interno o fiscal) ───────────────

export type CargarServicioData = {
  socioId: string;
  servicioId: string;
  concepto: string;
  comprobante: 'interno' | 'fiscal';
  fechaInicio: string;
  fechaBaja?: string | null;
  // Solo para tarifas Variable diaria: días contratados (el cargo único del
  // cron = precio diario × días). Se ignora para el resto de las tarifas.
  cantidadDias?: number | null;
};

export async function cargarServicioAction(data: CargarServicioData): Promise<{
  error?: string;
}> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  const gId = ctx.activeMembership.guarderiaId;

  if (!data.servicioId) return { error: 'Faltan datos del servicio.' };
  const esInterno = data.comprobante === 'interno';

  if (!data.fechaInicio) {
    return { error: 'La fecha de inicio del servicio es obligatoria.' };
  }
  if (data.fechaBaja && data.fechaBaja < data.fechaInicio) {
    return { error: 'La fecha de baja no puede ser anterior a la fecha de inicio.' };
  }

  if (await hayContratoVigente(gId, data.socioId, data.servicioId)) {
    return {
      error:
        'Este socio ya tiene este servicio contratado y vigente. Usá "Editar" en Servicios Contratados en vez de cargarlo de nuevo.',
    };
  }

  // "Cargar Servicio" solo registra el contrato (socio_servicios). Ya NO
  // crea un movimiento en cuenta corriente acá: eso lo hace el cron de
  // facturación mensual (`runMonthlyGeneracionServiciosRecurrentes`) cuando
  // corresponda facturar — Fijo, en cada ciclo mensual; Variable, una sola
  // vez. Así la cuenta corriente del socio recién se mueve cuando el
  // servicio efectivamente se factura, no al contratarlo.
  const [serv] = await db
    .select({
      nombre: servicios.nombre,
      estado: servicios.estado,
      tipoCobro: servicios.tipoCobro,
      tarifaVariable: servicios.tarifaVariable,
      vigenciaDesde: servicios.vigenciaDesde,
      vigenciaHasta: servicios.vigenciaHasta,
    })
    .from(servicios)
    .where(and(eq(servicios.id, data.servicioId), eq(servicios.guarderiaId, gId)))
    .limit(1);
  if (!serv) return { error: 'Servicio no encontrado.' };
  if (serv.estado !== 'activo') {
    return { error: 'Esta tarifa no está activa. No se puede cargar el servicio.' };
  }
  const hoyStr = new Date().toISOString().slice(0, 10);
  if (serv.vigenciaDesde > hoyStr || serv.vigenciaHasta < hoyStr) {
    return { error: 'Esta tarifa no está vigente. No se puede cargar el servicio.' };
  }

  // Tarifa Variable diaria: la cantidad de días es obligatoria (el cargo
  // único del cron = precio diario × días). Para el resto se fuerza null.
  const esDiaria = serv.tipoCobro === 'variable' && serv.tarifaVariable === 'diaria';
  if (esDiaria && (!Number.isInteger(data.cantidadDias) || (data.cantidadDias ?? 0) < 1)) {
    return { error: 'Indicá la cantidad de días (un número entero mayor a 0).' };
  }
  const cantidadDias = esDiaria ? (data.cantidadDias ?? null) : null;

  const conceptoFinal = data.concepto.trim() || null;

  await db.transaction(async (tx) => {
    await crearSocioServicio(tx, {
      guarderiaId: gId,
      socioId: data.socioId,
      servicioId: data.servicioId,
      fechaInicio: data.fechaInicio,
      fechaBaja: data.fechaBaja,
      comprobanteInterno: esInterno,
      concepto: conceptoFinal,
      cantidadDias,
      createdBy: ctx.profile.id,
    });
  });

  revalidatePath('/ventas');
  revalidatePath(`/usuarios/${data.socioId}`);
  return {};
}

// ─── Action: comprobante interno manual/lote ──────────────────────────────────
//
// Consolida cargos "Interno" pendientes (comprobante_interno = true, sin
// comprobante emitido todavía) en un solo documento no fiscal. No interactúa
// con ARCA ni con las facturas: es solo un recibo para imprimir/mandar.

async function nextComprobanteInternoCodigo(gId: string, prefix: 'CM' | 'CL'): Promise<string> {
  const [{ n }] = await db
    .select({ n: count() })
    .from(facturacion)
    .where(
      and(
        eq(facturacion.guarderiaId, gId),
        eq(facturacion.tipoFactura, 'recibo'),
        like(facturacion.codigo, `${prefix}-%`),
      ),
    );
  return `${prefix}-${String(Number(n) + 1).padStart(6, '0')}`;
}

export async function getSocioPendientesInternoAction(
  socioId: string,
): Promise<{ error?: string; movimientos?: MovimientoPendiente[] }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };

  const gId = ctx.activeMembership.guarderiaId;

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
        eq(movimientosCuentaCorriente.comprobanteInterno, true),
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

async function crearComprobanteInternoCore(
  data: { socioId: string; movimientoIds: string[]; fecha: string; guarderiaId: string },
  prefix: 'CM' | 'CL',
): Promise<{ error?: string; id?: string; codigo?: string }> {
  const gId = data.guarderiaId;

  if (!data.movimientoIds.length) return { error: 'Seleccioná al menos un ítem.' };

  const movs = await db
    .select({
      id: movimientosCuentaCorriente.id,
      concepto: movimientosCuentaCorriente.concepto,
      debe: movimientosCuentaCorriente.debe,
      comprobanteInterno: movimientosCuentaCorriente.comprobanteInterno,
      servicioAlicuotaIva: servicios.alicuotaIva,
    })
    .from(movimientosCuentaCorriente)
    .leftJoin(servicios, eq(servicios.id, movimientosCuentaCorriente.servicioId))
    .where(
      and(
        inArray(movimientosCuentaCorriente.id, data.movimientoIds),
        eq(movimientosCuentaCorriente.socioId, data.socioId),
        eq(movimientosCuentaCorriente.estado, 'no_pagado'),
      ),
    );

  if (movs.length === 0) return { error: 'No hay ítems para emitir.' };
  if (movs.some((m) => !m.comprobanteInterno)) {
    return { error: 'Solo se pueden incluir cargos marcados como Interno.' };
  }

  const total = movs.reduce((s, m) => s + parseFloat(m.debe ?? '0'), 0);
  if (total <= 0) return { error: 'El total del comprobante debe ser mayor a 0.' };

  const descripcion = `${movs[0].concepto ?? 'Servicio'}${movs.length > 1 ? ` (+${movs.length - 1})` : ''}`;
  // Sin tipo fiscal (es interno): fallback '21' si el cargo no viene de un
  // servicio del tarifario con alícuota propia. Mismo criterio que fiscal.
  const montos = desglosarMontos(
    movs.map((m) => ({
      importeUnitario: parseFloat(m.debe ?? '0'),
      cantidad: 1,
      alicuotaIva: m.servicioAlicuotaIva != null ? Number(m.servicioAlicuotaIva) : null,
    })),
    '21',
  );

  const facturaId = randomUUID();
  const codigo = await nextComprobanteInternoCodigo(gId, prefix);
  const emision = fechaCalendariaArg(data.fecha);

  await db.insert(facturacion).values({
    id: facturaId,
    guarderiaId: gId,
    socioId: data.socioId,
    tipoFactura: 'recibo',
    estado: 'pendiente',
    codigo,
    importe: total.toFixed(2),
    montoNeto: montos.montoNeto.toFixed(2),
    montoExento: montos.montoExento.toFixed(2),
    montoIva: montos.montoIva.toFixed(2),
    descripcion,
    emision,
  });

  const movimientoIds = movs.map((m) => m.id);
  for (const m of movs) {
    const [inserted] = await db
      .insert(facturacionItems)
      .values({
        facturacionId: facturaId,
        socioId: data.socioId,
        importe: parseFloat(m.debe ?? '0').toFixed(2),
        confirmado: true,
      })
      .returning({ id: facturacionItems.id });

    await db.insert(facturacionItemMovimientos).values({
      facturacionItemId: inserted.id,
      movimientoId: m.id,
    });
  }

  await db
    .update(movimientosCuentaCorriente)
    .set({ estado: 'facturado' })
    .where(inArray(movimientosCuentaCorriente.id, movimientoIds));

  revalidatePath('/ventas');
  revalidatePath(`/usuarios/${data.socioId}`);

  return { id: facturaId, codigo };
}

export type CrearComprobanteInternoData = {
  socioId: string;
  movimientoIds: string[];
  fecha: string;
};

export async function crearComprobanteInternoAction(
  data: CrearComprobanteInternoData,
): Promise<{ error?: string; id?: string; codigo?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  return crearComprobanteInternoCore(
    { ...data, guarderiaId: ctx.activeMembership.guarderiaId },
    'CM',
  );
}

export type ComprobanteInternoLoteResult = {
  succeeded: { socioId: string; id: string; codigo: string }[];
  skipped: { socioId: string; reason: string }[];
  failed: { socioId: string; error: string }[];
};

export async function crearComprobanteInternoLoteAction(data: {
  fecha: string;
  socioMovimientos: { socioId: string; movimientoIds: string[] }[];
}): Promise<{ error?: string; result?: ComprobanteInternoLoteResult }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!data.socioMovimientos.length) return { error: 'Seleccioná al menos un socio.' };

  const gId = ctx.activeMembership.guarderiaId;
  const result: ComprobanteInternoLoteResult = { succeeded: [], skipped: [], failed: [] };

  for (const { socioId, movimientoIds } of data.socioMovimientos) {
    if (!movimientoIds.length) {
      result.skipped.push({ socioId, reason: 'Sin ítems seleccionados' });
      continue;
    }
    const res = await crearComprobanteInternoCore(
      { socioId, movimientoIds, fecha: data.fecha, guarderiaId: gId },
      'CL',
    );
    if (res.error) {
      result.failed.push({ socioId, error: res.error });
    } else if (res.id && res.codigo) {
      result.succeeded.push({ socioId, id: res.id, codigo: res.codigo });
    }
  }

  revalidatePath('/ventas');
  return { result };
}

// ─── Action: enviar recibo por mail al socio ──────────────────────────────────

const TIPO_COMPROBANTE_LABEL_MAIL: Record<string, string> = {
  factura_a: 'Factura A',
  factura_b: 'Factura B',
  factura_c: 'Factura C',
  nota_credito_a: 'Nota de crédito A',
  nota_credito_b: 'Nota de crédito B',
  nota_credito_c: 'Nota de crédito C',
};

export async function enviarReciboPorMailAction(
  reciboId: string,
): Promise<{ error?: string; email?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  const gId = ctx.activeMembership.guarderiaId;

  const [row] = await db
    .select({
      id: facturacion.id,
      codigo: facturacion.codigo,
      tipoFactura: facturacion.tipoFactura,
      importe: facturacion.importe,
      descripcion: facturacion.descripcion,
      medioPago: facturacion.medioPago,
      emision: facturacion.emision,
      socioId: facturacion.socioId,
      socioNombre: profiles.nombre,
      socioApellido: profiles.apellido,
      socioCuit: profiles.cuit,
      socioDocumento: profiles.numeroDocumento,
      socioEmail: profiles.email,
      socioEmailFacturacion: profiles.emailFacturacion,
      guarderiaName: guarderias.nombre,
      guarderiaRazonSocial: guarderias.razonSocial,
      guarderiaDireccion: guarderias.direccion,
      guarderiaCuit: guarderias.cuit,
      guarderiaLogo: guarderias.logoUrl,
    })
    .from(facturacion)
    .leftJoin(profiles, eq(profiles.id, facturacion.socioId))
    .innerJoin(guarderias, eq(guarderias.id, facturacion.guarderiaId))
    .where(and(eq(facturacion.id, reciboId), eq(facturacion.guarderiaId, gId)))
    .limit(1);

  if (!row || row.tipoFactura !== 'recibo') return { error: 'Recibo no encontrado.' };

  const destino = row.socioEmailFacturacion?.trim() || row.socioEmail;
  if (!destino) return { error: 'El socio no tiene email cargado.' };

  // Comprobantes cancelados (FIFO), igual que la vista del recibo. Solo
  // aplica a recibos de cobranza (RC-): son los únicos que efectivamente
  // cobran comprobantes existentes. RB-/CM-/CL- documentan un cargo propio,
  // no un pago — para esos se usa row.descripcion más abajo.
  const comprobantes: string[] = [];
  if (row.socioId && row.codigo?.startsWith('RC-')) {
    const facturasSocio = await db
      .select({
        codigo: facturacion.codigo,
        tipoFactura: facturacion.tipoFactura,
        importe: facturacion.importe,
      })
      .from(facturacion)
      .where(
        and(
          eq(facturacion.socioId, row.socioId),
          eq(facturacion.guarderiaId, gId),
          ne(facturacion.tipoFactura, 'recibo'),
          inArray(facturacion.tipoFactura, ['factura_a', 'factura_b', 'factura_c']),
        ),
      )
      .orderBy(asc(facturacion.emision));
    const importeRecibo = parseFloat(row.importe ?? '0');
    let acumulado = 0;
    for (const f of facturasSocio) {
      if (acumulado >= importeRecibo - 0.001) break;
      comprobantes.push(
        `${TIPO_COMPROBANTE_LABEL_MAIL[f.tipoFactura ?? ''] ?? f.tipoFactura ?? ''} ${f.codigo ?? ''}`.trim(),
      );
      acumulado += parseFloat(f.importe ?? '0');
    }
  }
  if (comprobantes.length === 0 && row.descripcion) comprobantes.push(row.descripcion);

  const socioNombre =
    [row.socioNombre, row.socioApellido].filter(Boolean).join(' ').trim() || 'Socio';
  const doc = row.socioCuit
    ? `CUIT: ${row.socioCuit}`
    : row.socioDocumento
      ? `DNI: ${row.socioDocumento}`
      : '';
  const importeFmt = `$${parseFloat(row.importe ?? '0').toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
  const fecha = (row.emision ?? new Date()).toLocaleDateString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const { subject, html } = reciboEmail({
    clubNombre: row.guarderiaRazonSocial ?? row.guarderiaName,
    clubCuit: row.guarderiaCuit,
    clubDireccion: row.guarderiaDireccion,
    clubLogoUrl: row.guarderiaLogo,
    numero: row.codigo ?? '',
    fecha,
    recibiDe: doc ? `${socioNombre} — ${doc}` : socioNombre,
    importeFmt,
    comprobantes,
    formaPago: row.medioPago ? (FORMA_PAGO_LABEL[row.medioPago] ?? row.medioPago) : null,
    // "Recibo" solo para Cobranzas (RC-); CM-/CL-/RB- son Comprobante interno.
    esComprobanteInterno: !row.codigo?.startsWith('RC-'),
  });

  const res = await sendEmail({ to: destino, subject, html });
  if (!res.ok) return { error: 'No se pudo enviar el mail. Intentá de nuevo.' };
  return { email: destino };
}

// ─── Notas de Crédito y Débito ─────────────────────────────────────────────
//
// Dos caminos para llegar a una NC/ND, con validación distinta cada uno — no
// se mezclan en una sola función:
//  - emitirNotaAsociadaAction: parte de un comprobante fiscal ya emitido
//    (precompleta tipo/número/fecha, tope de importe = importe original).
//  - emitirNotaLibreAction: decisión comercial nueva sin comprobante de
//    origen (elige socio a mano, importe libre, sin tope).
// Ambas comparten los helpers de más abajo (armar el payload de TusFacturas
// y registrar el movimiento en cuenta corriente), que no dependen de cuál
// de los dos caminos las llamó.

export type EmitirNcMotivo = MotivoNota;

export type EmitirNotaResult = {
  error?: string;
  notaId?: string;
  comprobanteNro?: string;
  folioLocal?: string;
  pdfUrl?: string;
};

async function cargarSocioParaFacturar(gId: string, socioId: string) {
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
    .where(eq(profiles.id, socioId))
    .limit(1);
  return socio ?? null;
}

async function cargarCredsGuarderia(gId: string) {
  const [guarderia] = await db
    .select({
      puntoDeVenta: guarderias.puntoDeVenta,
      cuit: guarderias.cuit,
      rubro: guarderias.rubro,
      condicionIva: guarderias.condicionIva,
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
    return null;
  }

  const creds: TusFacturasCredentials = {
    apikey: guarderia.tusfacturasApikey,
    apitoken: guarderia.tusfacturasApitoken,
    usertoken: guarderia.tusfacturasUsertoken,
  };
  return { guarderia, creds };
}

/**
 * Arma el payload de NC/ND y lo emite en TusFacturas. `asociado` es opcional:
 * si viene, se manda `comprobantes_asociados` (camino "asociada"); si no, se
 * omite (camino "libre"). Nunca se manda `pagos` — ni la NC ni la ND lo
 * aceptan (confirmado contra la documentación oficial de TusFacturas).
 */
async function emitirNotaTusFacturas(params: {
  notaId: string;
  tipoFactura: 'factura_a' | 'factura_b' | 'factura_c';
  esNc: boolean;
  importe: number;
  descripcion: string;
  cliente: TusFacturasCliente;
  guarderia: { puntoDeVenta: number | null; rubro: string | null };
  creds: TusFacturasCredentials;
  asociado?: TusFacturasComprobanteAsociado;
}) {
  const notaId = params.notaId;
  const hoy = toTusFecha(new Date());
  const tipoApi = params.esNc ? TIPO_NC_API[params.tipoFactura] : TIPO_ND_API[params.tipoFactura];

  const comprobante: TusFacturasComprobante = {
    fecha: hoy,
    vencimiento: hoy,
    tipo: tipoApi,
    idioma: 1,
    external_reference: notaId,
    operacion: 'V',
    punto_venta: String(params.guarderia.puntoDeVenta),
    moneda: 'PES',
    cotizacion: 1,
    periodo_facturado_desde: hoy,
    periodo_facturado_hasta: hoy,
    rubro: params.guarderia.rubro ?? 'Servicios náuticos',
    rubro_grupo_contable: process.env.TUSFACTURAS_RUBRO_GRUPO ?? 'Servicios',
    detalle: buildDetalle(
      [{ descripcion: params.descripcion, cantidad: 1, importeUnitario: params.importe }],
      params.tipoFactura,
    ),
    total: params.importe.toFixed(2),
    ...(params.asociado ? { comprobantes_asociados: [params.asociado] } : {}),
  };

  const apiResponse = await crearFactura({ cliente: params.cliente, comprobante }, params.creds);
  return { notaId, apiResponse };
}

/** Inserta el movimiento de cuenta corriente que corresponde a la nota: NC
 * resta (haber, ya "pagado" — un crédito no queda pendiente de cobro), ND
 * suma (debe, "facturado" — nace con su propio comprobante fiscal, como
 * cualquier cargo ya facturado). */
async function registrarMovimientoNota(params: {
  socioId: string;
  esNc: boolean;
  importe: number;
  concepto: string;
  createdBy: string;
}): Promise<string> {
  const importeStr = params.importe.toFixed(2);
  const [row] = await db
    .insert(movimientosCuentaCorriente)
    .values(
      params.esNc
        ? {
            socioId: params.socioId,
            concepto: params.concepto,
            // 'nota_credito' (no 'otro'): la cuenta corriente lo usa para
            // mostrar "Anulado (NC)" en vez de "Cobrado" en el cargo que cubre.
            tipo: 'nota_credito',
            estado: 'pagado',
            debe: '0',
            haber: importeStr,
            importeSigned: `-${importeStr}`,
            fecha: new Date(),
            createdBy: params.createdBy,
          }
        : {
            socioId: params.socioId,
            concepto: params.concepto,
            tipo: 'otro',
            estado: 'facturado',
            debe: importeStr,
            haber: '0',
            importeSigned: importeStr,
            fecha: new Date(),
            createdBy: params.createdBy,
          },
    )
    .returning({ id: movimientosCuentaCorriente.id });
  return row.id;
}

// ─── Camino "asociada": parte de un comprobante ya emitido ────────────────

export type EmitirNotaAsociadaData = {
  facturaOriginalId: string;
  esNc: boolean;
  motivo: MotivoNota;
  /** Requerido salvo NC + motivo === 'anulacion_total' (se completa con el importe original). */
  importe?: number;
  descripcion?: string;
  /** Define el prefijo del folio local: FM (individual) o FL (en lote). Default 'manual'. */
  origen?: 'manual' | 'lote';
};

export async function emitirNotaAsociadaAction(
  data: EmitirNotaAsociadaData,
): Promise<EmitirNotaResult> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };

  const gId = ctx.activeMembership.guarderiaId;
  const tipoNota = data.esNc ? 'NC' : 'ND';

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
    return { error: `Solo se puede emitir ${tipoNota} sobre facturas ARCA (A, B o C).` };
  }

  if (!original.cae) {
    return {
      error: `Esta factura no tiene CAE registrado. Solo se pueden emitir ${tipoNota} sobre facturas emitidas desde este sistema.`,
    };
  }

  if (!original.codigo) return { error: 'La factura no tiene número de comprobante.' };

  // Parsear "PPPPP-NNNNNNNN" → punto_venta y numero
  const [puntoVentaStr, numeroStr] = original.codigo.split('-');
  if (!puntoVentaStr || !numeroStr) {
    return { error: 'El número de comprobante tiene formato inesperado.' };
  }

  // 2. Determinar importe. "Anulación total" solo tiene sentido para NC
  // (completar automáticamente el importe original en una ND implicaría
  // cobrarle al socio el doble, así que ahí el importe siempre es manual).
  const importeOriginal = parseFloat(original.importe ?? '0');
  let importeNota: number;
  if (data.esNc && data.motivo === 'anulacion_total') {
    importeNota = importeOriginal;
  } else {
    if (!data.importe || data.importe <= 0) {
      return { error: `Ingresá el importe de la ${tipoNota}.` };
    }
    if (data.importe > importeOriginal) {
      return {
        error: `El importe de la ${tipoNota} no puede superar el total de la factura original.`,
      };
    }
    importeNota = data.importe;
  }

  // 3. Cargar socio y creds de guardería
  if (!original.socioId) return { error: 'La factura original no tiene socio asociado.' };
  const socio = await cargarSocioParaFacturar(gId, original.socioId);
  if (!socio) return { error: 'No se encontró el socio de la factura original.' };

  const credsInfo = await cargarCredsGuarderia(gId);
  if (!credsInfo) return { error: 'Faltan datos de facturación de la guardería.' };
  const { guarderia, creds } = credsInfo;

  // 4. Construir payload
  const condVenta = (original.condicionVenta ?? 'contado') as CondicionVenta;
  const cliente = buildCliente({ ...socio, condicionVenta: condVenta });

  const descripcionNota =
    data.descripcion?.trim() ||
    `${tipoNota} — ${MOTIVO_NOTA_LABEL[data.motivo]} de comprobante ${original.codigo}`;

  const asociado: TusFacturasComprobanteAsociado = {
    tipo_comprobante: TIPO_FACTURA_API[tipoOriginal],
    punto_venta: puntoVentaStr,
    numero: numeroStr,
    comprobante_fecha: toTusFecha(original.emision),
    cuit: (guarderia.cuit ?? '').replace(/[-\s]/g, ''),
  };

  const notaId = randomUUID();
  const tipoNotaFactura = (data.esNc ? NC_TIPO_FACTURA : ND_TIPO_FACTURA)[tipoOriginal];
  // Sin desglose por ítem (la nota es un monto único) — mismo fallback de
  // alícuota que ya usa `buildDetalle` para este caso.
  const montos = desglosarMontos(
    [{ importeUnitario: importeNota, cantidad: 1 }],
    alicuotaPara(tipoOriginal),
  );

  let apiResponse;
  try {
    ({ apiResponse } = await emitirNotaTusFacturas({
      notaId,
      tipoFactura: tipoOriginal,
      esNc: data.esNc,
      importe: importeNota,
      descripcion: descripcionNota,
      cliente,
      guarderia,
      creds,
      asociado,
    }));
  } catch (err) {
    // ARCA rechazó la nota: se guarda igual (sin folioLocal/codigo/cae) para
    // que quede a la vista en Ventas, en vez de perder el intento. A
    // diferencia de una factura, no hay cargos que bloquear — la nota no
    // consume movimientos pendientes hasta que se confirma.
    const motivoError =
      err instanceof Error ? err.message : `Error al emitir la ${tipoNota} en TusFacturas.`;
    try {
      await db.insert(facturacion).values({
        id: notaId,
        guarderiaId: gId,
        socioId: original.socioId,
        tipoFactura: tipoNotaFactura as never,
        estado: 'pendiente',
        descripcion: descripcionNota,
        importe: importeNota.toFixed(2),
        montoNeto: montos.montoNeto.toFixed(2),
        montoExento: montos.montoExento.toFixed(2),
        montoIva: montos.montoIva.toFixed(2),
        emision: new Date(),
        externalReference: notaId,
        facturaOriginalId: data.facturaOriginalId,
        rechazada: true,
        motivoError,
      });
      revalidatePath('/ventas');
    } catch (persistErr) {
      console.error('No se pudo guardar la nota rechazada', { notaId, persistErr });
    }
    return { error: motivoError, notaId };
  }

  // 5. Persistir nota + movimiento
  try {
    const folioLocal = await nextFolioLocal(gId, data.origen === 'lote' ? 'FL' : 'FM');

    await db.insert(facturacion).values({
      id: notaId,
      guarderiaId: gId,
      socioId: original.socioId,
      tipoFactura: tipoNotaFactura as never,
      estado: 'pagada',
      codigo: apiResponse.comprobante_nro ?? null,
      folioLocal,
      archivo: apiResponse.comprobante_pdf_url ?? null,
      cae: apiResponse.cae ?? null,
      caeVencimiento: parseTusFecha(apiResponse.vencimiento_cae),
      descripcion: descripcionNota,
      importe: importeNota.toFixed(2),
      montoNeto: montos.montoNeto.toFixed(2),
      montoExento: montos.montoExento.toFixed(2),
      montoIva: montos.montoIva.toFixed(2),
      emision: new Date(),
      externalReference: notaId,
      facturaOriginalId: data.facturaOriginalId,
    });

    const movimientoId = await registrarMovimientoNota({
      socioId: original.socioId,
      esNc: data.esNc,
      importe: importeNota,
      concepto: descripcionNota,
      createdBy: ctx.user.id,
    });
    // Vincula la nota a su propio movimiento (mismo patrón que RC-/CM-/CL-)
    // para que el cálculo de cobertura sepa a qué cargo puntual aplica esta
    // NC, en vez de tratarla como crédito genérico.
    await db.update(facturacion).set({ movimientoId }).where(eq(facturacion.id, notaId));

    revalidatePath('/ventas');
    revalidatePath(`/usuarios/${original.socioId}`);

    return {
      notaId,
      comprobanteNro: apiResponse.comprobante_nro,
      folioLocal,
      pdfUrl: apiResponse.comprobante_pdf_url,
    };
  } catch (err) {
    console.error(`${tipoNota} emitida en TusFacturas pero falló persistencia`, {
      comprobanteNro: apiResponse.comprobante_nro,
      err,
    });
    return {
      error:
        `La ${tipoNota} se emitió en ARCA pero no se pudo guardar. Contactá al administrador con el número ` +
        (apiResponse.comprobante_nro ?? notaId),
    };
  }
}

/** Alias de compatibilidad: la NC "asociada" tal como existía antes de
 * agregar ND y el camino libre. Sigue usándola el lote de NC (solo
 * anulación total), que no cambió. */
export async function emitirNotaCreditoAction(
  data: Omit<EmitirNotaAsociadaData, 'esNc'>,
): Promise<EmitirNotaResult> {
  return emitirNotaAsociadaAction({ ...data, esNc: true });
}

// ─── Nota de Crédito interna: anula/reduce un Comprobante interno (CM-/CL-) ──
//
// A diferencia de emitirNotaAsociadaAction, NO pasa por TusFacturas/ARCA —
// un Comprobante interno no tiene validez fiscal, así que no hay nada que
// reportarle a AFIP. Mismo molde (motivo, importe opcional si es anulación
// total, descripción) pero simplificado: sin CAE, sin estado "rechazada",
// numeración propia NCI-NNNNNN. El asiento en cuenta corriente reusa
// registrarMovimientoNota tal cual — el mismo `tipo: 'nota_credito'` que ya
// usa la NC fiscal es lo que hace que la Cuenta Corriente lo muestre como
// "Anulado (NC)" en vez de "Cobrado".

async function nextNotaCreditoInternaCodigo(gId: string): Promise<string> {
  const [{ n }] = await db
    .select({ n: count() })
    .from(facturacion)
    .where(and(eq(facturacion.guarderiaId, gId), like(facturacion.codigo, 'NCI-%')));
  return `NCI-${String(Number(n) + 1).padStart(6, '0')}`;
}

export type EmitirNotaCreditoInternaData = {
  facturaOriginalId: string;
  motivo: MotivoNota;
  /** Requerido salvo motivo === 'anulacion_total' (se completa con el importe original). */
  importe?: number;
  descripcion?: string;
};

export async function emitirNotaCreditoInternaAction(
  data: EmitirNotaCreditoInternaData,
): Promise<{ error?: string; id?: string; codigo?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  const gId = ctx.activeMembership.guarderiaId;

  const [original] = await db
    .select({
      id: facturacion.id,
      codigo: facturacion.codigo,
      tipoFactura: facturacion.tipoFactura,
      importe: facturacion.importe,
      socioId: facturacion.socioId,
    })
    .from(facturacion)
    .where(and(eq(facturacion.id, data.facturaOriginalId), eq(facturacion.guarderiaId, gId)))
    .limit(1);

  if (!original) return { error: 'Comprobante no encontrado.' };
  if (
    original.tipoFactura !== 'recibo' ||
    !(original.codigo?.startsWith('CM-') || original.codigo?.startsWith('CL-'))
  ) {
    return {
      error:
        'Solo se puede emitir una Nota de Crédito interna sobre un Comprobante interno (CM-/CL-).',
    };
  }
  if (!original.socioId) return { error: 'El comprobante no tiene socio asociado.' };

  const importeOriginal = parseFloat(original.importe ?? '0');
  let importeNota: number;
  if (data.motivo === 'anulacion_total') {
    importeNota = importeOriginal;
  } else {
    if (!data.importe || data.importe <= 0) {
      return { error: 'Ingresá el importe de la Nota de Crédito interna.' };
    }
    if (data.importe > importeOriginal) {
      return { error: 'El importe no puede superar el total del comprobante original.' };
    }
    importeNota = data.importe;
  }

  const descripcionNota =
    data.descripcion?.trim() ||
    `NC interna — ${MOTIVO_NOTA_LABEL[data.motivo]} de comprobante ${original.codigo}`;

  // Sin tipo fiscal (es interno): mismo fallback de alícuota que usa
  // crearComprobanteInternoCore para lo interno.
  const montos = desglosarMontos([{ importeUnitario: importeNota, cantidad: 1 }], '21');

  const notaId = randomUUID();
  const codigo = await nextNotaCreditoInternaCodigo(gId);

  try {
    await db.insert(facturacion).values({
      id: notaId,
      guarderiaId: gId,
      socioId: original.socioId,
      tipoFactura: 'nota_credito_interna',
      estado: 'pagada',
      codigo,
      descripcion: descripcionNota,
      importe: importeNota.toFixed(2),
      montoNeto: montos.montoNeto.toFixed(2),
      montoExento: montos.montoExento.toFixed(2),
      montoIva: montos.montoIva.toFixed(2),
      emision: new Date(),
      facturaOriginalId: data.facturaOriginalId,
    });

    const movimientoId = await registrarMovimientoNota({
      socioId: original.socioId,
      esNc: true,
      importe: importeNota,
      concepto: descripcionNota,
      createdBy: ctx.user.id,
    });
    await db.update(facturacion).set({ movimientoId }).where(eq(facturacion.id, notaId));

    revalidatePath('/ventas');
    revalidatePath(`/usuarios/${original.socioId}`);

    return { id: notaId, codigo };
  } catch {
    return { error: 'No se pudo emitir la Nota de Crédito interna.' };
  }
}

// ─── Camino "libre": decisión comercial nueva, sin comprobante de origen ──

export type EmitirNotaLibreData = {
  socioId: string;
  esNc: boolean;
  motivo: MotivoNota;
  importe: number;
  descripcion?: string;
};

export async function emitirNotaLibreAction(data: EmitirNotaLibreData): Promise<EmitirNotaResult> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };

  const gId = ctx.activeMembership.guarderiaId;
  const tipoNota = data.esNc ? 'NC' : 'ND';

  if (!data.importe || data.importe <= 0) {
    return { error: `Ingresá el importe de la ${tipoNota}.` };
  }

  const socio = await cargarSocioParaFacturar(gId, data.socioId);
  if (!socio) return { error: 'El socio no pertenece a esta guardería.' };

  const credsInfo = await cargarCredsGuarderia(gId);
  if (!credsInfo) return { error: 'Faltan datos de facturación de la guardería.' };
  const { guarderia, creds } = credsInfo;

  // Sin factura original de la cual copiar el tipo: se deriva igual que al
  // crear una factura manual, según condición de IVA de guardería + socio.
  const socioCondicionIva = socio.facturaFiscal ? socio.condicionIvaPersonal : socio.condicionIva;
  const tipoFactura = derivarTipoFactura(guarderia.condicionIva, socioCondicionIva);

  const cliente = buildCliente({ ...socio, condicionVenta: 'cuenta_corriente' });
  const descripcionNota =
    data.descripcion?.trim() || `${tipoNota} — ${MOTIVO_NOTA_LABEL[data.motivo]}`;

  const notaId = randomUUID();
  const tipoNotaFactura = (data.esNc ? NC_TIPO_FACTURA : ND_TIPO_FACTURA)[tipoFactura];
  const montos = desglosarMontos(
    [{ importeUnitario: data.importe, cantidad: 1 }],
    alicuotaPara(tipoFactura),
  );

  let apiResponse;
  try {
    ({ apiResponse } = await emitirNotaTusFacturas({
      notaId,
      tipoFactura,
      esNc: data.esNc,
      importe: data.importe,
      descripcion: descripcionNota,
      cliente,
      guarderia,
      creds,
    }));
  } catch (err) {
    const motivoError =
      err instanceof Error ? err.message : `Error al emitir la ${tipoNota} en TusFacturas.`;
    try {
      await db.insert(facturacion).values({
        id: notaId,
        guarderiaId: gId,
        socioId: data.socioId,
        tipoFactura: tipoNotaFactura as never,
        estado: 'pendiente',
        descripcion: descripcionNota,
        importe: data.importe.toFixed(2),
        montoNeto: montos.montoNeto.toFixed(2),
        montoExento: montos.montoExento.toFixed(2),
        montoIva: montos.montoIva.toFixed(2),
        emision: new Date(),
        externalReference: notaId,
        rechazada: true,
        motivoError,
      });
      revalidatePath('/ventas');
    } catch (persistErr) {
      console.error('No se pudo guardar la nota rechazada', { notaId, persistErr });
    }
    return { error: motivoError, notaId };
  }

  try {
    const folioLocal = await nextFolioLocal(gId, 'FM');

    await db.insert(facturacion).values({
      id: notaId,
      guarderiaId: gId,
      socioId: data.socioId,
      tipoFactura: tipoNotaFactura as never,
      estado: 'pagada',
      codigo: apiResponse.comprobante_nro ?? null,
      folioLocal,
      archivo: apiResponse.comprobante_pdf_url ?? null,
      cae: apiResponse.cae ?? null,
      caeVencimiento: parseTusFecha(apiResponse.vencimiento_cae),
      descripcion: descripcionNota,
      importe: data.importe.toFixed(2),
      montoNeto: montos.montoNeto.toFixed(2),
      montoExento: montos.montoExento.toFixed(2),
      montoIva: montos.montoIva.toFixed(2),
      emision: new Date(),
      externalReference: notaId,
    });

    const movimientoId = await registrarMovimientoNota({
      socioId: data.socioId,
      esNc: data.esNc,
      importe: data.importe,
      concepto: descripcionNota,
      createdBy: ctx.user.id,
    });
    await db.update(facturacion).set({ movimientoId }).where(eq(facturacion.id, notaId));

    revalidatePath('/ventas');
    revalidatePath(`/usuarios/${data.socioId}`);

    return {
      notaId,
      comprobanteNro: apiResponse.comprobante_nro,
      folioLocal,
      pdfUrl: apiResponse.comprobante_pdf_url,
    };
  } catch (err) {
    console.error(`${tipoNota} libre emitida en TusFacturas pero falló persistencia`, {
      comprobanteNro: apiResponse.comprobante_nro,
      err,
    });
    return {
      error:
        `La ${tipoNota} se emitió en ARCA pero no se pudo guardar. Contactá al administrador con el número ` +
        (apiResponse.comprobante_nro ?? notaId),
    };
  }
}
