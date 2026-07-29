'use server';

import { revalidatePath } from 'next/cache';
import { and, asc, count, eq, inArray, like, ne, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { db } from '@/lib/db';
import {
  cargosPendientes,
  facturacion,
  facturacionItemMovimientos,
  facturacionItems,
  guarderiaCentrosEmisores,
  guarderias,
  memberships,
  movimientosCuentaCorriente,
  profiles,
  servicios,
  socioServicios,
} from '@/lib/db/schema';
import { getActiveMarina } from '@/lib/auth/session';
import { fechaCalendariaArg } from '@/lib/dates';
import { sendEmail } from '@/lib/email/resend';
import { reciboEmail } from '@/lib/email/templates/recibo';
import { identidadFacturacion, type SocioFacturacion } from '@/lib/facturacion/identidad';
import { getCargosSaldadosFifo } from '@/lib/reconciliar-cuenta';
import {
  claveItem,
  listarPendientesFacturar,
  type DbExecutor,
  type ItemPendiente,
  type ItemPendienteKey,
} from '@/lib/pendientes-facturar';
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
  /**
   * Pendientes de facturar computados desde los contratos vigentes (modelo
   * "los cargos nacen al emitir"): la emisión los re-computa server-side y
   * crea sus movimientos dentro de la misma transacción del comprobante.
   */
  itemKeys?: ItemPendienteKey[];
  /**
   * LEGACY (transición): cargos ya existentes en cuenta corriente sin
   * comprobante. Se marcan como facturados/pagados y se linkean a items de
   * la factura. Se retira cuando el pool legacy drene.
   */
  movimientoIds?: string[];
  /** Línea libre si no hay movimientos. */
  items?: { descripcion: string; cantidad: number; importeUnitario: number }[];
  /** Centro emisor (punto de venta) por el que sale. Default: el principal. */
  centroEmisorId?: string | null;
};

export type CreateBatchInvoiceData = {
  socioMovimientos: {
    socioId: string;
    movimientoIds?: string[];
    itemKeys?: ItemPendienteKey[];
  }[];
  medioPago: MedioPago;
  fecha: string;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function derivarTipoFactura(
  guarderiaCondicion: string | null,
  socioCondicion: string | null,
): TipoFactura {
  if (guarderiaCondicion !== 'responsable_inscripto') return 'factura_c';
  // Socios RI y Monotributistas reciben Factura A (cuadro del cliente:
  // a los monotributistas les corresponde A, no B).
  if (socioCondicion === 'responsable_inscripto' || socioCondicion === 'monotributo') {
    return 'factura_a';
  }
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

// ─── Emisión con cargos que nacen al emitir ─────────────────────────────────
// Patrón reservar → emitir → confirmar: la transacción de reserva (TX1) crea
// los movimientos y la factura con un sentinel `rechazada`; la llamada a
// TusFacturas ocurre DESPUÉS del commit (HTTP largo fuera de la tx del
// pooler); el resultado confirma (limpia el sentinel) o deja la factura
// rechazada con el motivo real — recuperable por Reenviar. Un crash a mitad
// deja el mismo estado que un rechazo: nada se pierde ni se duplica.

const SENTINEL_EMISION = 'EMISION_EN_CURSO';

/** Error de emisión con mensaje apto para mostrar al admin. */
class EmisionError extends Error {}

function esUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === '23505'
  );
}

function mensajeErrorEmision(err: unknown): string | null {
  if (err instanceof EmisionError) return err.message;
  if (esUniqueViolation(err)) {
    return 'Uno o más servicios ya fueron facturados para este período. Actualizá la página y volvé a intentar.';
  }
  return null;
}

function inicioMesSiguiente(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0, 0));
}

/**
 * Serializa las emisiones de un mismo socio (manual vs. cron, dos admins,
 * doble click). Advisory lock scoped a la transacción: seguro con el pooler
 * de Supabase en modo transacción (toda la tx viaja por una sola conexión).
 * Nunca usar la variante de sesión acá.
 */
async function lockEmisionSocio(tx: DbExecutor, gId: string, socioId: string): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${'fact:' + gId + ':' + socioId}, 0))`,
  );
}

type FuenteDetalle = {
  descripcion: string;
  cantidad: number;
  importeUnitario: number;
  alicuotaIva?: number | null;
  /** Movimiento a linkear al item de la factura (null solo en línea libre). */
  movimientoId: string | null;
};

/**
 * Materializa dentro de la transacción de emisión los ítems pendientes
 * seleccionados: re-computa los pendientes (post-lock), matchea la selección
 * del cliente por key y crea el movimiento de cada uno (nace 'facturado').
 * Además consume los cargos_pendientes (baja anticipada) y cierra los
 * contratos Variable. Los índices únicos de la mig 0133 son el backstop
 * físico si algo se filtra igual.
 */
async function materializarItemsPendientes(
  tx: DbExecutor,
  params: {
    guarderiaId: string;
    socioId: string;
    keys: ItemPendienteKey[];
    canal: 'fiscal' | 'interno';
    now: Date;
  },
): Promise<FuenteDetalle[]> {
  const { guarderiaId, socioId, keys, canal, now } = params;
  const vigentes = await listarPendientesFacturar(guarderiaId, { socioId, now, dbx: tx });
  const porClave = new Map(vigentes.map((i) => [claveItem(i.key), i]));
  const todayStr = now.toISOString().slice(0, 10);
  const fuentes: FuenteDetalle[] = [];

  for (const key of keys) {
    const item = porClave.get(claveItem(key));
    if (!item) {
      throw new EmisionError(
        'Uno o más servicios ya fueron facturados o cambiaron. Actualizá la página y volvé a intentar.',
      );
    }
    if (canal === 'fiscal' && item.comprobanteInterno) {
      throw new EmisionError(
        'Los servicios marcados como Interno se emiten con comprobante interno, no con factura.',
      );
    }
    if (canal === 'interno' && !item.comprobanteInterno) {
      throw new EmisionError(
        'Solo se pueden incluir servicios marcados como Interno en un comprobante interno.',
      );
    }

    const importe = item.importe.toFixed(2);
    const [mov] = await tx
      .insert(movimientosCuentaCorriente)
      .values({
        socioId,
        servicioId: item.servicioId,
        espacioId: item.espacioId,
        socioServicioId: item.contratoId,
        periodo: item.periodo,
        concepto: item.concepto,
        tipo: item.tipoMovimiento,
        estado: 'facturado',
        debe: importe,
        importeSigned: importe,
        fecha: now,
        proximoPago: item.tipoMovimiento === 'mensual' ? inicioMesSiguiente(now) : null,
        comprobanteInterno: item.comprobanteInterno,
      })
      .returning({ id: movimientosCuentaCorriente.id });

    if (item.key.origen === 'baja') {
      const consumido = await tx
        .update(cargosPendientes)
        .set({ movimientoId: mov.id, updatedAt: new Date() })
        .where(
          and(
            eq(cargosPendientes.id, item.key.cargoPendienteId),
            sql`${cargosPendientes.movimientoId} IS NULL`,
          ),
        )
        .returning({ id: cargosPendientes.id });
      if (consumido.length === 0) {
        throw new EmisionError(
          'El cobro por baja ya fue incluido en otro comprobante. Actualizá la página.',
        );
      }
    }

    if (item.esVariable && item.contratoId) {
      await tx
        .update(socioServicios)
        .set({ fechaBaja: todayStr, updatedAt: new Date() })
        .where(eq(socioServicios.id, item.contratoId));
    }

    fuentes.push({
      descripcion: item.concepto,
      cantidad: 1,
      importeUnitario: item.importe,
      alicuotaIva: item.alicuotaIva,
      movimientoId: mov.id,
    });
  }

  return fuentes;
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

  // 1.b Traer el centro emisor (el elegido o el principal) + sus creds.
  // SIN fallback a env vars: las env vars son las creds master de NauticaApp y
  // solo se usan para dar de alta el POS. Facturar con ellas haría que la
  // factura saliera a nombre de NauticaApp, no de la guardería.
  const credsInfo = await cargarCredsGuarderia(gId, { centroEmisorId: data.centroEmisorId });
  if (!credsInfo) {
    return {
      error:
        'Esta guardería todavía no tiene los datos impositivos configurados. Andá a Mi perfil → Datos Impositivos y completá los datos antes de facturar.',
    };
  }
  const { guarderia, centro, creds: credsOverride } = credsInfo;

  if (!guarderia.certificadoAfipOk) {
    return {
      error:
        'El certificado de enlace con ARCA todavía no está confirmado. Andá a Mi perfil → Datos Impositivos, solicitá el certificado y confirmá la instalación antes de emitir facturas.',
    };
  }

  const puntoVenta = String(centro.puntoDeVenta);
  const rubroGuarderia = guarderia.rubro ?? 'Servicios náuticos';

  // 2. Reservar (TX1): materializar los ítems computados, tomar los cargos
  // legacy, e insertar la factura con sentinel + items + links — todo en una
  // transacción, ANTES de tocar ARCA. Si algo falla acá, no se creó nada en
  // TusFacturas y los pendientes siguen intactos.
  const itemKeys = data.itemKeys ?? [];
  const legacyIds = data.movimientoIds ?? [];

  if (itemKeys.length === 0 && legacyIds.length === 0 && !(data.items && data.items.length > 0)) {
    return { error: 'No hay items para facturar.' };
  }

  // Guard legacy (pre-tx): un cargo ya cubierto por el pool de haberes (FIFO)
  // — aunque su `estado` todavía diga 'no_pagado', por ej. un cobro Payway
  // que no llegó a reconciliarse — no se vuelve a facturar.
  if (legacyIds.length > 0) {
    const saldados = await getCargosSaldadosFifo(data.socioId);
    if (legacyIds.some((id) => saldados.has(id))) {
      return {
        error:
          'Uno o más cargos ya están cubiertos por un pago y no se pueden facturar. Actualizá la página.',
      };
    }
  }

  const facturaId = randomUUID();
  const now = new Date();
  const estadoFactura = data.estado ?? 'pendiente';

  const fuentes: FuenteDetalle[] = [];
  let total = 0;
  let descripcionFactura = '';
  let montos = { montoNeto: 0, montoExento: 0, montoIva: 0 };

  try {
    await db.transaction(async (tx) => {
      await lockEmisionSocio(tx, gId, data.socioId);

      if (itemKeys.length > 0) {
        fuentes.push(
          ...(await materializarItemsPendientes(tx, {
            guarderiaId: gId,
            socioId: data.socioId,
            keys: itemKeys,
            canal: 'fiscal',
            now,
          })),
        );
      }

      if (legacyIds.length > 0) {
        const movs = await tx
          .select({
            id: movimientosCuentaCorriente.id,
            concepto: movimientosCuentaCorriente.concepto,
            debe: movimientosCuentaCorriente.debe,
            comprobanteInterno: movimientosCuentaCorriente.comprobanteInterno,
            // Alícuota real del servicio del cargo (si lo tiene) para no
            // asumir 21% en servicios Exentos o al 10,5%.
            servicioAlicuotaIva: servicios.alicuotaIva,
            servicioTipo: servicios.tipo,
          })
          .from(movimientosCuentaCorriente)
          .leftJoin(servicios, eq(servicios.id, movimientosCuentaCorriente.servicioId))
          .where(
            and(
              inArray(movimientosCuentaCorriente.id, legacyIds),
              eq(movimientosCuentaCorriente.socioId, data.socioId),
              // Re-check post-lock: si otro proceso los facturó mientras
              // tanto, ya no están 'no_pagado' y la emisión aborta limpia.
              eq(movimientosCuentaCorriente.estado, 'no_pagado'),
            ),
          );

        if (movs.length !== legacyIds.length) {
          throw new EmisionError(
            'Uno o más cargos ya fueron facturados. Actualizá la página y volvé a intentar.',
          );
        }
        // Guard duro: un cargo con comprobante interno NO se factura (no va
        // por TusFacturas). Las listas ya lo ocultan, pero el id podría
        // llegar igual; acá se rechaza del lado del server.
        if (movs.some((m) => m.comprobanteInterno)) {
          throw new EmisionError('No se puede facturar un cargo con comprobante interno.');
        }

        for (const m of movs) {
          fuentes.push({
            descripcion: descripcionConCategoria(m.concepto, m.servicioTipo),
            cantidad: 1,
            importeUnitario: parseFloat(m.debe ?? '0'),
            alicuotaIva: m.servicioAlicuotaIva != null ? Number(m.servicioAlicuotaIva) : null,
            movimientoId: m.id,
          });
        }
        await tx
          .update(movimientosCuentaCorriente)
          .set({ estado: 'facturado' })
          .where(
            inArray(
              movimientosCuentaCorriente.id,
              movs.map((m) => m.id),
            ),
          );
      }

      if (fuentes.length === 0 && data.items && data.items.length > 0) {
        for (const it of data.items) {
          fuentes.push({ ...it, alicuotaIva: null, movimientoId: null });
        }
      }

      if (fuentes.length === 0) throw new EmisionError('No hay items para facturar.');
      total = totalItems(fuentes);
      if (total <= 0) throw new EmisionError('El total de la factura debe ser mayor a 0.');

      descripcionFactura =
        data.descripcion?.trim() ||
        `Factura ${TIPO_FACTURA_API[data.tipoFactura]} — ${fuentes[0].descripcion}${
          fuentes.length > 1 ? ` (+${fuentes.length - 1})` : ''
        }`;
      montos = desglosarMontos(fuentes, alicuotaPara(data.tipoFactura));

      await tx.insert(facturacion).values({
        id: facturaId,
        guarderiaId: gId,
        socioId: data.socioId,
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
        centroEmisorId: centro.id,
        rechazada: true,
        motivoError: SENTINEL_EMISION,
      });

      // Items + links por id real del movimiento (nada posicional).
      for (const f of fuentes) {
        const [inserted] = await tx
          .insert(facturacionItems)
          .values({
            facturacionId: facturaId,
            socioId: data.socioId,
            importe: (f.cantidad * f.importeUnitario).toFixed(2),
            confirmado: true,
          })
          .returning({ id: facturacionItems.id });

        if (f.movimientoId) {
          await tx.insert(facturacionItemMovimientos).values({
            facturacionItemId: inserted.id,
            movimientoId: f.movimientoId,
          });
        }
      }
    });
  } catch (err) {
    const msg = mensajeErrorEmision(err);
    if (msg) return { error: msg };
    console.error('Error reservando la emisión de la factura', { facturaId, err });
    return { error: 'No se pudo iniciar la emisión. Probá de nuevo en unos segundos.' };
  }

  // 3. Emitir en TusFacturas — fuera de la transacción (HTTP largo). La
  // reserva ya está commiteada: si esto falla, la factura queda `rechazada`
  // con sus cargos linkeados (el período queda tomado por este intento) y se
  // resuelve por Reenviar. Un crash acá deja el sentinel EMISION_EN_CURSO —
  // mismo estado, mismo camino de salida.
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
    detalle: buildDetalle(fuentes, data.tipoFactura),
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
    try {
      await db.update(facturacion).set({ motivoError }).where(eq(facturacion.id, facturaId));
      revalidatePath('/ventas');
      revalidatePath(`/usuarios/${data.socioId}`);
    } catch (persistErr) {
      console.error('No se pudo registrar el motivo del rechazo', { facturaId, persistErr });
    }
    return { error: motivoError, facturaId };
  }

  // 4. Confirmar: limpiar el sentinel y completar los datos de ARCA.
  try {
    const folioLocal = opts?.folioPrefix ? await nextFolioLocal(gId, opts.folioPrefix) : null;

    await db
      .update(facturacion)
      .set({
        codigo: apiResponse.comprobante_nro ?? null,
        folioLocal,
        archivo: apiResponse.comprobante_pdf_url ?? null,
        cae: apiResponse.cae ?? null,
        caeVencimiento: parseTusFecha(apiResponse.vencimiento_cae),
        rechazada: false,
        motivoError: null,
      })
      .where(eq(facturacion.id, facturaId));

    if (estadoFactura === 'pagada') {
      // Si la factura se crea ya pagada, los movimientos también quedan pagados.
      const movIds = fuentes.map((f) => f.movimientoId).filter((id): id is string => id != null);
      if (movIds.length > 0) {
        await db
          .update(movimientosCuentaCorriente)
          .set({ estado: 'pagado' })
          .where(inArray(movimientosCuentaCorriente.id, movIds));
      }
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
    // Emitida en ARCA pero falló la confirmación local: la factura queda con
    // el sentinel (rechazada) — NO reenviarla sin verificar en TusFacturas,
    // por eso el mensaje pide contactar al administrador con el número.
    console.error('Factura emitida en tusfacturas pero falló la confirmación local', {
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
      centroEmisorId: facturacion.centroEmisorId,
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

  // Mismo centro emisor con el que se intentó la emisión original; si la
  // rechazada es anterior a la existencia de centros emisores, el principal.
  const credsInfo = await cargarCredsGuarderia(gId, {
    centroEmisorId: rechazada.centroEmisorId,
  });
  if (!credsInfo) {
    return { error: 'Esta guardería todavía no tiene los datos impositivos configurados.' };
  }
  const { guarderia, centro, creds: credsOverride } = credsInfo;
  if (!guarderia.certificadoAfipOk) {
    return { error: 'El certificado de enlace con ARCA todavía no está confirmado.' };
  }

  const cliente = buildCliente({ ...socio, condicionVenta: data.condicionVenta });
  const comprobante: TusFacturasComprobante = {
    fecha: toTusFecha(data.fecha),
    vencimiento: toTusFecha(data.vencimiento),
    tipo: TIPO_FACTURA_API[data.tipoFactura],
    idioma: 1,
    external_reference: facturaId,
    operacion: 'V',
    punto_venta: String(centro.puntoDeVenta),
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
      // Rechazadas anteriores a los centros emisores no lo tenían registrado.
      centroEmisorId: centro.id,
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

  for (const { socioId, movimientoIds, itemKeys } of data.socioMovimientos) {
    if (!validSocioMap.has(socioId)) {
      result.skipped.push({ socioId, reason: 'Socio fuera de la guardería activa' });
      continue;
    }
    if (!(movimientoIds?.length || itemKeys?.length)) {
      result.skipped.push({ socioId, reason: 'Sin servicios seleccionados' });
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
        itemKeys,
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

// ─── Action: pendientes de emisión (computados + legacy) ────────────────────
// Modelo "los cargos nacen al emitir": la lista de emisión sale del cómputo
// en vivo sobre socio_servicios + espacios + cargos_pendientes (ver
// src/lib/pendientes-facturar.ts), más — durante la transición — los cargos
// legacy que quedaron en cuenta corriente sin comprobante. Ambos comparten la
// forma de fila para que los modales los muestren en una sola lista; al
// emitir, las filas computadas viajan como `itemKeys` y las legacy como
// `movimientoIds`.

export type PendienteEmision = {
  /** Id de fila para la UI: uuid del movimiento legacy o clave computada. */
  id: string;
  concepto: string;
  debe: string;
  fecha: string | null;
  /** null = cargo legacy de cuenta corriente. */
  itemKey: ItemPendienteKey | null;
  tipoServicio: string | null;
  esProporcional: boolean;
  esVariable: boolean;
  origen: 'contrato' | 'espacio' | 'baja' | 'legacy';
  /** Alícuota IVA de la tarifa — para el desglose Neto/IVA del modal. */
  alicuotaIva: number | null;
  /** Plazo de cobro (días) de la tarifa — para sugerir el vencimiento. */
  plazoPagoDias: number | null;
};

function itemPendienteARow(item: ItemPendiente): PendienteEmision {
  return {
    id: claveItem(item.key),
    concepto: item.concepto,
    debe: item.importe.toFixed(2),
    fecha: null,
    itemKey: item.key,
    tipoServicio: item.servicioTipo,
    esProporcional: item.esProporcional,
    esVariable: item.esVariable,
    origen: item.origen,
    alicuotaIva: item.alicuotaIva,
    plazoPagoDias: item.plazoPagoDias,
  };
}

export async function getPendientesEmisionAction(
  socioId: string,
  canal: 'fiscal' | 'interno',
): Promise<{ error?: string; pendientes?: PendienteEmision[] }> {
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

  const items = await listarPendientesFacturar(gId, { socioId });
  const computados = items
    .filter((i) => (canal === 'interno' ? i.comprobanteInterno : !i.comprobanteInterno))
    .map(itemPendienteARow);

  // Legacy: cargos de cuenta corriente sin comprobante (transición).
  const rows = await db
    .select({
      id: movimientosCuentaCorriente.id,
      fecha: movimientosCuentaCorriente.fecha,
      concepto: movimientosCuentaCorriente.concepto,
      debe: movimientosCuentaCorriente.debe,
      tipoServicio: servicios.tipo,
      alicuotaIva: servicios.alicuotaIva,
      plazoPagoDias: servicios.plazoPagoDias,
    })
    .from(movimientosCuentaCorriente)
    .leftJoin(servicios, eq(servicios.id, movimientosCuentaCorriente.servicioId))
    .where(
      and(
        eq(movimientosCuentaCorriente.socioId, socioId),
        eq(movimientosCuentaCorriente.estado, 'no_pagado'),
        eq(movimientosCuentaCorriente.comprobanteInterno, canal === 'interno'),
      ),
    )
    .orderBy(movimientosCuentaCorriente.fecha);

  // En fiscal, excluir cargos ya cubiertos por el pool de haberes (FIFO) —
  // mismo criterio histórico de getSocioPendientesAction.
  let legacy = rows;
  if (canal === 'fiscal' && rows.length > 0) {
    const saldados = await getCargosSaldadosFifo(socioId);
    legacy = rows.filter((r) => !saldados.has(r.id));
  }

  return {
    pendientes: [
      ...computados,
      ...legacy.map((r) => ({
        id: r.id,
        concepto: r.concepto ?? 'Servicio',
        debe: r.debe ?? '0',
        fecha: r.fecha ? r.fecha.toISOString() : null,
        itemKey: null,
        tipoServicio: r.tipoServicio,
        esProporcional: false,
        esVariable: false,
        origen: 'legacy' as const,
        alicuotaIva: r.alicuotaIva != null ? Number(r.alicuotaIva) : null,
        plazoPagoDias: r.plazoPagoDias,
      })),
    ],
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

  // Creds del centro emisor que emitió este comprobante (el POS va en el
  // prefijo del codigo) — con varios centros, las del principal no sirven
  // para consultar un comprobante de otro POS.
  const credsData = await cargarCredsGuarderia(gId, { puntoVenta: parseInt(pv, 10) });
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
    // La consulta anida los datos dentro de `comprobante` (la emisión los trae
    // en la raíz — por eso el fallback).
    const pdfUrl =
      rta.comprobante?.comprobante_pdf_url ?? (rta.comprobante_pdf_url as string | undefined);
    if (!pdfUrl) {
      return { error: 'TusFacturas no devolvió el PDF de este comprobante.' };
    }

    // Refrescar el link guardado, así queda el más nuevo disponible.
    await db.update(facturacion).set({ archivo: pdfUrl }).where(eq(facturacion.id, facturaId));

    return { url: pdfUrl };
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
      .returning({ socioId: facturacion.socioId, movimientoId: facturacion.movimientoId });

    if (!updated) return { error: 'Factura no encontrada.' };

    // Propagar estado 'pagado' a los movimientos vinculados a esta factura:
    // M:N (facturas con items) + link directo (Notas de Débito, comprobantes
    // internos con movimiento propio).
    const items = await db
      .select({ id: facturacionItems.id })
      .from(facturacionItems)
      .where(eq(facturacionItems.facturacionId, id));

    const movIds = new Set<string>();
    if (updated.movimientoId) movIds.add(updated.movimientoId);
    if (items.length > 0) {
      const itemIds = items.map((i) => i.id);
      const links = await db
        .select({ movimientoId: facturacionItemMovimientos.movimientoId })
        .from(facturacionItemMovimientos)
        .where(inArray(facturacionItemMovimientos.facturacionItemId, itemIds));
      for (const l of links) movIds.add(l.movimientoId);
    }
    if (movIds.size > 0) {
      await db
        .update(movimientosCuentaCorriente)
        .set({ estado: 'pagado' })
        .where(inArray(movimientosCuentaCorriente.id, [...movIds]));
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

// CM = manual, CL = lote, CA = automático (cron) — espeja FM/FL/FA.
type PrefijoInterno = 'CM' | 'CL' | 'CA';

async function nextComprobanteInternoCodigo(
  dbx: DbExecutor,
  gId: string,
  prefix: PrefijoInterno,
): Promise<string> {
  // Serializa el count-then-insert entre emisiones concurrentes de la misma
  // guardería (el lock por socio no cubre a dos socios distintos). Solo tiene
  // efecto si dbx es una transacción — el codigo se asigna siempre dentro de
  // la tx de emisión.
  await dbx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${'ci:' + gId + ':' + prefix}, 0))`,
  );
  const [{ n }] = await dbx
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

// Exportada para la auto-emisión del cron (prefijo CA), igual que
// crearFacturaCore. Ninguna de las dos valida sesión — el caller es
// responsable del scope de guardería.
export async function crearComprobanteInternoCore(
  data: {
    socioId: string;
    movimientoIds?: string[];
    itemKeys?: ItemPendienteKey[];
    fecha: string;
    guarderiaId: string;
  },
  prefix: PrefijoInterno,
): Promise<{ error?: string; id?: string; codigo?: string }> {
  const gId = data.guarderiaId;
  const legacyIds = data.movimientoIds ?? [];
  const itemKeys = data.itemKeys ?? [];

  if (!legacyIds.length && !itemKeys.length) return { error: 'Seleccioná al menos un ítem.' };

  const facturaId = randomUUID();
  const now = new Date();

  try {
    const res = await db.transaction(async (tx) => {
      await lockEmisionSocio(tx, gId, data.socioId);

      const fuentes: FuenteDetalle[] = [];

      if (itemKeys.length > 0) {
        fuentes.push(
          ...(await materializarItemsPendientes(tx, {
            guarderiaId: gId,
            socioId: data.socioId,
            keys: itemKeys,
            canal: 'interno',
            now,
          })),
        );
      }

      if (legacyIds.length > 0) {
        const movs = await tx
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
              inArray(movimientosCuentaCorriente.id, legacyIds),
              eq(movimientosCuentaCorriente.socioId, data.socioId),
              eq(movimientosCuentaCorriente.estado, 'no_pagado'),
            ),
          );

        if (movs.length !== legacyIds.length) {
          throw new EmisionError(
            'Uno o más ítems ya fueron incluidos en otro comprobante. Actualizá la página.',
          );
        }
        if (movs.some((m) => !m.comprobanteInterno)) {
          throw new EmisionError('Solo se pueden incluir cargos marcados como Interno.');
        }

        for (const m of movs) {
          fuentes.push({
            descripcion: m.concepto ?? 'Servicio',
            cantidad: 1,
            importeUnitario: parseFloat(m.debe ?? '0'),
            alicuotaIva: m.servicioAlicuotaIva != null ? Number(m.servicioAlicuotaIva) : null,
            movimientoId: m.id,
          });
        }
        await tx
          .update(movimientosCuentaCorriente)
          .set({ estado: 'facturado' })
          .where(
            inArray(
              movimientosCuentaCorriente.id,
              movs.map((m) => m.id),
            ),
          );
      }

      if (fuentes.length === 0) throw new EmisionError('No hay ítems para emitir.');
      const total = totalItems(fuentes);
      if (total <= 0) throw new EmisionError('El total del comprobante debe ser mayor a 0.');

      const descripcion = `${fuentes[0].descripcion}${
        fuentes.length > 1 ? ` (+${fuentes.length - 1})` : ''
      }`;
      // Sin tipo fiscal (es interno): fallback '21' si el ítem no viene de un
      // servicio del tarifario con alícuota propia. Mismo criterio que fiscal.
      const montos = desglosarMontos(fuentes, '21');

      const codigo = await nextComprobanteInternoCodigo(tx, gId, prefix);

      await tx.insert(facturacion).values({
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
        emision: fechaCalendariaArg(data.fecha),
      });

      for (const f of fuentes) {
        const [inserted] = await tx
          .insert(facturacionItems)
          .values({
            facturacionId: facturaId,
            socioId: data.socioId,
            importe: (f.cantidad * f.importeUnitario).toFixed(2),
            confirmado: true,
          })
          .returning({ id: facturacionItems.id });

        if (f.movimientoId) {
          await tx.insert(facturacionItemMovimientos).values({
            facturacionItemId: inserted.id,
            movimientoId: f.movimientoId,
          });
        }
      }

      return { id: facturaId, codigo };
    });

    revalidatePath('/ventas');
    revalidatePath(`/usuarios/${data.socioId}`);
    return res;
  } catch (err) {
    const msg = mensajeErrorEmision(err);
    if (msg) return { error: msg };
    console.error('Error emitiendo comprobante interno', { facturaId, err });
    return { error: 'No se pudo emitir el comprobante. Probá de nuevo en unos segundos.' };
  }
}

export type CrearComprobanteInternoData = {
  socioId: string;
  movimientoIds?: string[];
  itemKeys?: ItemPendienteKey[];
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
  socioMovimientos: {
    socioId: string;
    movimientoIds?: string[];
    itemKeys?: ItemPendienteKey[];
  }[];
}): Promise<{ error?: string; result?: ComprobanteInternoLoteResult }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!data.socioMovimientos.length) return { error: 'Seleccioná al menos un socio.' };

  const gId = ctx.activeMembership.guarderiaId;
  const result: ComprobanteInternoLoteResult = { succeeded: [], skipped: [], failed: [] };

  for (const { socioId, movimientoIds, itemKeys } of data.socioMovimientos) {
    if (!(movimientoIds?.length || itemKeys?.length)) {
      result.skipped.push({ socioId, reason: 'Sin ítems seleccionados' });
      continue;
    }
    const res = await crearComprobanteInternoCore(
      { socioId, movimientoIds, itemKeys, fecha: data.fecha, guarderiaId: gId },
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

/**
 * Datos fiscales de la guardería + el centro emisor (punto de venta) a usar
 * en una emisión, con sus credenciales de TusFacturas.
 *
 * - Sin opts → el centro emisor principal.
 * - `centroEmisorId` → ese centro, validando que pertenezca a la guardería.
 * - `puntoVenta` → por número de POS (para NC/ND o PDF de un comprobante ya
 *   emitido, cuyo POS viene en el prefijo del `codigo`).
 */
async function cargarCredsGuarderia(
  gId: string,
  opts?: { centroEmisorId?: string | null; puntoVenta?: number | null },
) {
  const [guarderia] = await db
    .select({
      cuit: guarderias.cuit,
      rubro: guarderias.rubro,
      condicionIva: guarderias.condicionIva,
      certificadoAfipOk: guarderias.certificadoAfipOk,
    })
    .from(guarderias)
    .where(eq(guarderias.id, gId))
    .limit(1);
  if (!guarderia) return null;

  const filtroCentro = opts?.centroEmisorId
    ? eq(guarderiaCentrosEmisores.id, opts.centroEmisorId)
    : opts?.puntoVenta != null
      ? eq(guarderiaCentrosEmisores.puntoDeVenta, opts.puntoVenta)
      : eq(guarderiaCentrosEmisores.esPrincipal, true);

  const [centro] = await db
    .select({
      id: guarderiaCentrosEmisores.id,
      nombre: guarderiaCentrosEmisores.nombre,
      puntoDeVenta: guarderiaCentrosEmisores.puntoDeVenta,
      apikey: guarderiaCentrosEmisores.apikey,
      apitoken: guarderiaCentrosEmisores.apitoken,
      usertoken: guarderiaCentrosEmisores.usertoken,
    })
    .from(guarderiaCentrosEmisores)
    .where(and(eq(guarderiaCentrosEmisores.guarderiaId, gId), filtroCentro))
    .limit(1);

  if (!centro?.apikey || !centro.apitoken || !centro.usertoken) return null;

  const creds: TusFacturasCredentials = {
    apikey: centro.apikey,
    apitoken: centro.apitoken,
    usertoken: centro.usertoken,
  };
  return {
    guarderia: {
      puntoDeVenta: centro.puntoDeVenta,
      cuit: guarderia.cuit,
      rubro: guarderia.rubro,
      condicionIva: guarderia.condicionIva,
      certificadoAfipOk: guarderia.certificadoAfipOk,
    },
    centro: { id: centro.id, nombre: centro.nombre, puntoDeVenta: centro.puntoDeVenta },
    creds,
  };
}

/**
 * Arma el payload de NC/ND y lo emite en TusFacturas. `asociado` es opcional:
 * si viene, se manda `comprobantes_asociados` (camino "asociada"); si no, se
 * manda `comprobantes_asociados_periodo` (camino "libre" — ARCA exige uno de
 * los dos bloques, una nota sin ninguno se rechaza). Nunca se manda `pagos` —
 * ni la NC ni la ND lo aceptan (confirmado contra la documentación oficial de
 * TusFacturas).
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
  /** Fecha de emisión (formato TusFecha). Default: hoy. */
  fecha?: string;
  /** Inicio del período facturado (formato TusFecha). Default: hoy. */
  periodoDesde?: string;
  /** Fin del período facturado (formato TusFecha). Default: hoy. */
  periodoHasta?: string;
  /** Rango asociado (formato TusFecha) para notas SIN comprobante de origen:
   *  se manda como `comprobantes_asociados_periodo`. Ignorado si hay
   *  `asociado`. */
  periodoAsociado?: { desde: string; hasta: string };
}) {
  const notaId = params.notaId;
  const hoy = toTusFecha(new Date());
  const fecha = params.fecha ?? hoy;
  const tipoApi = params.esNc ? TIPO_NC_API[params.tipoFactura] : TIPO_ND_API[params.tipoFactura];

  const comprobante: TusFacturasComprobante = {
    fecha,
    vencimiento: fecha,
    tipo: tipoApi,
    idioma: 1,
    external_reference: notaId,
    operacion: 'V',
    punto_venta: String(params.guarderia.puntoDeVenta),
    moneda: 'PES',
    cotizacion: 1,
    periodo_facturado_desde: params.periodoDesde ?? hoy,
    periodo_facturado_hasta: params.periodoHasta ?? hoy,
    rubro: params.guarderia.rubro ?? 'Servicios náuticos',
    rubro_grupo_contable: process.env.TUSFACTURAS_RUBRO_GRUPO ?? 'Servicios',
    detalle: buildDetalle(
      [{ descripcion: params.descripcion, cantidad: 1, importeUnitario: params.importe }],
      params.tipoFactura,
    ),
    total: params.importe.toFixed(2),
    ...(params.asociado
      ? { comprobantes_asociados: [params.asociado] }
      : params.periodoAsociado
        ? {
            comprobantes_asociados_periodo: {
              fecha_desde: params.periodoAsociado.desde,
              fecha_hasta: params.periodoAsociado.hasta,
            },
          }
        : {}),
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
      centroEmisorId: facturacion.centroEmisorId,
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

  // Tope ACUMULADO (solo NC): entre todas las notas de crédito de una misma
  // factura no se puede acreditar más que su total — sería devolver plata que
  // nunca se facturó. Las NC rechazadas por ARCA no cuentan.
  let disponibleNc = importeOriginal;
  if (data.esNc) {
    const previas = await db
      .select({ importe: facturacion.importe, rechazada: facturacion.rechazada })
      .from(facturacion)
      .where(
        and(
          eq(facturacion.guarderiaId, gId),
          eq(facturacion.facturaOriginalId, data.facturaOriginalId),
          inArray(facturacion.tipoFactura, ['nota_credito_a', 'nota_credito_b', 'nota_credito_c']),
        ),
      );
    const acreditado = previas
      .filter((p) => !p.rechazada)
      .reduce((s, p) => s + parseFloat(p.importe ?? '0'), 0);
    disponibleNc = importeOriginal - acreditado;
    if (disponibleNc <= 0.001) {
      return {
        error: `La factura ${original.codigo} ya fue acreditada por completo por notas de crédito anteriores.`,
      };
    }
  }

  let importeNota: number;
  if (data.esNc && data.motivo === 'anulacion_total') {
    if (disponibleNc < importeOriginal - 0.001) {
      return {
        error: `Esta factura ya tiene notas de crédito por $${(importeOriginal - disponibleNc).toFixed(2)}: no se puede anular por el total. Emití una NC parcial de hasta $${disponibleNc.toFixed(2)}.`,
      };
    }
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
    if (data.esNc && data.importe > disponibleNc + 0.001) {
      return {
        error: `Entre todas las NC de una factura no se puede acreditar más que su total: quedan disponibles $${disponibleNc.toFixed(2)} de $${importeOriginal.toFixed(2)}.`,
      };
    }
    importeNota = data.importe;
  }

  // 3. Cargar socio y creds de guardería
  if (!original.socioId) return { error: 'La factura original no tiene socio asociado.' };
  const socio = await cargarSocioParaFacturar(gId, original.socioId);
  if (!socio) return { error: 'No se encontró el socio de la factura original.' };

  // La nota sale por el MISMO centro emisor que la factura original (ARCA la
  // asocia por POS+número): se resuelve por el id registrado o, para
  // facturas anteriores a los centros emisores, por el prefijo del codigo.
  const credsInfo = await cargarCredsGuarderia(
    gId,
    original.centroEmisorId
      ? { centroEmisorId: original.centroEmisorId }
      : { puntoVenta: parseInt(puntoVentaStr, 10) },
  );
  if (!credsInfo) return { error: 'Faltan datos de facturación de la guardería.' };
  const { guarderia, centro, creds } = credsInfo;

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
        centroEmisorId: centro.id,
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
      // NC nace 'pagada' (un crédito no queda pendiente de cobro). La ND es
      // deuda nueva del socio, igual que una factura: nace 'pendiente' para
      // entrar al circuito de cobro (Cobranzas, KPIs, estado en Ventas).
      estado: data.esNc ? 'pagada' : 'pendiente',
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
      centroEmisorId: centro.id,
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

  // Tope acumulado, igual que en las NC fiscales: entre todas las NC internas
  // de un mismo comprobante no se puede acreditar más que su total.
  const previasNci = await db
    .select({ importe: facturacion.importe })
    .from(facturacion)
    .where(
      and(
        eq(facturacion.guarderiaId, gId),
        eq(facturacion.facturaOriginalId, data.facturaOriginalId),
        eq(facturacion.tipoFactura, 'nota_credito_interna'),
      ),
    );
  const acreditadoNci = previasNci.reduce((s, p) => s + parseFloat(p.importe ?? '0'), 0);
  const disponibleNci = importeOriginal - acreditadoNci;
  if (disponibleNci <= 0.001) {
    return {
      error: `El comprobante ${original.codigo} ya fue acreditado por completo por notas de crédito internas anteriores.`,
    };
  }

  let importeNota: number;
  if (data.motivo === 'anulacion_total') {
    if (disponibleNci < importeOriginal - 0.001) {
      return {
        error: `Este comprobante ya tiene NC internas por $${acreditadoNci.toFixed(2)}: no se puede anular por el total. Emití una NC parcial de hasta $${disponibleNci.toFixed(2)}.`,
      };
    }
    importeNota = importeOriginal;
  } else {
    if (!data.importe || data.importe <= 0) {
      return { error: 'Ingresá el importe de la Nota de Crédito interna.' };
    }
    if (data.importe > disponibleNci + 0.001) {
      return {
        error: `Entre todas las NC internas no se puede acreditar más que el total del comprobante: quedan disponibles $${disponibleNci.toFixed(2)} de $${importeOriginal.toFixed(2)}.`,
      };
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
  /** Centro emisor (punto de venta) por el que sale. Default: el principal. */
  centroEmisorId?: string | null;
  /** Fecha de emisión (YYYY-MM-DD). Default: hoy. */
  fecha?: string;
  /** Período asociado (YYYY-MM-DD): la alternativa de ARCA a asociar un
   *  comprobante puntual — la nota queda referida a este rango de fechas.
   *  Default: últimos 30 días. */
  periodoDesde?: string;
  periodoHasta?: string;
};

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function emitirNotaLibreAction(data: EmitirNotaLibreData): Promise<EmitirNotaResult> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };

  const gId = ctx.activeMembership.guarderiaId;
  const tipoNota = data.esNc ? 'NC' : 'ND';

  if (!data.importe || data.importe <= 0) {
    return { error: `Ingresá el importe de la ${tipoNota}.` };
  }
  for (const f of [data.fecha, data.periodoDesde, data.periodoHasta]) {
    if (f != null && !YMD_RE.test(f)) return { error: 'Fecha inválida.' };
  }
  // ARCA exige que toda NC/ND referencie comprobantes o un período: sin
  // comprobante de origen, va el período (default: últimos 30 días).
  const periodoDesde =
    data.periodoDesde ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const periodoHasta = data.periodoHasta ?? new Date().toISOString().slice(0, 10);
  if (periodoDesde > periodoHasta) {
    return { error: 'El inicio del período no puede ser posterior al fin.' };
  }

  const socio = await cargarSocioParaFacturar(gId, data.socioId);
  if (!socio) return { error: 'El socio no pertenece a esta guardería.' };

  const credsInfo = await cargarCredsGuarderia(gId, { centroEmisorId: data.centroEmisorId });
  if (!credsInfo) return { error: 'Faltan datos de facturación de la guardería.' };
  const { guarderia, centro, creds } = credsInfo;

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
      fecha: data.fecha ? toTusFecha(data.fecha) : undefined,
      // Sin comprobante de origen, ARCA exige asociar un período: la nota
      // queda referida a este rango (bloque comprobantes_asociados_periodo)
      // y el período facturado informado acompaña.
      periodoDesde: toTusFecha(periodoDesde),
      periodoHasta: toTusFecha(periodoHasta),
      periodoAsociado: { desde: toTusFecha(periodoDesde), hasta: toTusFecha(periodoHasta) },
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
        emision: data.fecha ? fechaCalendariaArg(data.fecha) : new Date(),
        externalReference: notaId,
        centroEmisorId: centro.id,
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
      // Igual que en la nota asociada: NC 'pagada', ND 'pendiente' (deuda
      // nueva a cobrar, como una factura).
      estado: data.esNc ? 'pagada' : 'pendiente',
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
      emision: data.fecha ? fechaCalendariaArg(data.fecha) : new Date(),
      externalReference: notaId,
      centroEmisorId: centro.id,
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
