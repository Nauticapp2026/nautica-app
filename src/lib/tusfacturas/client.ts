/**
 * Cliente HTTP para la API de tusfacturas.app
 * Docs: https://developers.tusfacturas.app
 *
 * Las credenciales se leen de variables de entorno. En el futuro se pueden
 * sobreescribir por guardería (pasando un TusFacturasCredentials custom).
 */

const TUSFACTURAS_BASE = 'https://www.tusfacturas.app/app/api/v2';

// ─── Tipos ──────────────────────────────────────────────────────────────────

export type TusFacturasCredentials = {
  usertoken: string;
  apikey: string;
  apitoken: string;
};

export type TusFacturasCliente = {
  codigo: string; // identificador único del cliente en TF (usamos el UUID del socio)
  documento_tipo: string; // 'DNI' | 'CUIT' | 'CUIL' | 'PASAPORTE' | 'CDI' | 'OTRO'
  documento_nro: string;
  razon_social: string;
  email: string;
  domicilio: string;
  provincia: string; // código AFIP: '1' = CABA, '2' = Buenos Aires, etc.
  condicion_pago_otra?: string; // requerido si condicion_pago === '214' (Otra)
  envia_por_mail: 'S' | 'N';
  reclama_deuda: 'S' | 'N';
  rg5329: 'S' | 'N';
  condicion_pago: string; // '201' contado, '211' 30 días, etc.
  condicion_iva: string; // 'CF' | 'RI' | 'M' | 'E' | 'CDEX' | 'IVNA' | 'PDEX'
  condicion_iva_operacion: string;
};

export type TusFacturasDetalleItem = {
  cantidad: number;
  afecta_stock: 'S' | 'N';
  producto: {
    descripcion: string;
    codigo: string;
    lista_precios: string; // 'standard'
    leyenda: string;
    unidad_bulto: number;
    unidad_medida: number; // 7 = unidades (tabla AFIP)
    alicuota: string; // '21'
    precio_unitario_sin_iva: number;
    actualiza_precio: 'S' | 'N';
    rg5329: 'S' | 'N';
  };
  leyenda: string;
  tratamiento_descuento: string; // 'A'
  bonificacion_porcentaje: number;
};

export type TusFacturasFormaPago = {
  descripcion: string;
  importe: number;
};

export type TusFacturasComprobanteAsociado = {
  tipo_comprobante: string; // 'FACTURA A' | 'FACTURA B' | 'FACTURA C'
  punto_venta: string; // '00005'
  numero: string; // '00000001'
  comprobante_fecha: string; // 'DD/MM/YYYY'
  cuit: string; // CUIT del emisor del comprobante original (la guardería)
};

export type TusFacturasComprobante = {
  fecha: string; // 'DD/MM/YYYY'
  vencimiento: string; // 'DD/MM/YYYY'
  tipo: string; // 'FACTURA A' | 'NOTA DE CREDITO A' | ...
  idioma: number; // 1 = Español
  external_reference: string;
  operacion: 'V'; // Venta
  punto_venta: string;
  moneda: 'PES';
  cotizacion: number;
  periodo_facturado_desde: string; // 'DD/MM/YYYY'
  periodo_facturado_hasta: string; // 'DD/MM/YYYY'
  rubro: string;
  rubro_grupo_contable: string;
  detalle: TusFacturasDetalleItem[];
  total: string;
  /** Pago aplicado al comprobante. NO se manda en notas de crédito: AFIP/TusFacturas
   *  no permite aplicarle un pago a una NC (confirmado por soporte de TusFacturas). */
  pagos?: {
    formas_pago: TusFacturasFormaPago[];
    total: number;
  };
  /** Solo para NC — referencia a la factura original */
  comprobantes_asociados?: TusFacturasComprobanteAsociado[];
};

export type TusFacturasNuevaFacturaInput = {
  cliente: TusFacturasCliente;
  comprobante: TusFacturasComprobante;
};

export type TusFacturasNuevaFacturaResponse = {
  error: 'S' | 'N';
  errores?: string[];
  rta?: string;
  externalReference?: string;
  comprobante_nro?: string;
  comprobante_tipo?: string;
  cae?: string;
  vencimiento_cae?: string;
  comprobante_pdf_url?: string;
};

// ─── Credenciales ───────────────────────────────────────────────────────────

export function getCredentialsFromEnv(): TusFacturasCredentials {
  const usertoken = process.env.TUSFACTURAS_USERTOKEN;
  const apikey = process.env.TUSFACTURAS_APIKEY;
  const apitoken = process.env.TUSFACTURAS_APITOKEN;
  if (!usertoken || !apikey || !apitoken) {
    throw new Error(
      'Credenciales de tusfacturas.app no configuradas (TUSFACTURAS_USERTOKEN/APIKEY/APITOKEN).',
    );
  }
  return { usertoken, apikey, apitoken };
}

// ─── API ────────────────────────────────────────────────────────────────────

export async function crearFactura(
  input: TusFacturasNuevaFacturaInput,
  creds: TusFacturasCredentials = getCredentialsFromEnv(),
): Promise<TusFacturasNuevaFacturaResponse> {
  const res = await fetch(`${TUSFACTURAS_BASE}/facturacion/nuevo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...creds, ...input }),
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`tusfacturas HTTP ${res.status}`);
  }

  const data = (await res.json()) as TusFacturasNuevaFacturaResponse;
  if (data.error === 'S') {
    const msg = data.errores?.join(' · ') ?? data.rta ?? 'Error al emitir la factura';
    throw new Error(msg);
  }
  return data;
}

// ─── Consulta de comprobante ────────────────────────────────────────────────

export type TusFacturasConsultaResponse = {
  error: 'S' | 'N';
  errores?: string[];
  rta?: string;
  // OJO: a diferencia de la emisión (que trae comprobante_pdf_url en la raíz),
  // la consulta devuelve los datos anidados dentro de `comprobante`.
  comprobante?: {
    comprobante_pdf_url?: string;
    comprobante_ticket_url?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

/**
 * Consulta un comprobante ya emitido. La usamos para regenerar el link del
 * PDF: la `comprobante_pdf_url` que devuelve la emisión es una URL TEMPORAL
 * (según la FAQ oficial) — cuando vence, la página de TusFacturas muestra
 * "no se ha encontrado información asociada a tu búsqueda". Según la doc,
 * esta consulta no contabiliza como request de la suscripción.
 */
export async function consultarComprobante(
  input: { tipo: string; punto_venta: string; numero: string },
  creds: TusFacturasCredentials = getCredentialsFromEnv(),
): Promise<TusFacturasConsultaResponse> {
  const res = await fetch(`${TUSFACTURAS_BASE}/facturacion/consulta`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...creds, comprobante: { operacion: 'V', ...input } }),
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`tusfacturas HTTP ${res.status}`);
  }

  const data = (await res.json()) as TusFacturasConsultaResponse;
  if (data.error === 'S') {
    const msg = data.errores?.join(' · ') ?? data.rta ?? 'Error al consultar el comprobante';
    throw new Error(msg);
  }
  return data;
}

// ─── Punto de venta (administrar) ───────────────────────────────────────────

export type TusFacturasPuntoVentaInput = {
  operacion: 'A' | 'M'; // alta | modificación
  punto_venta: string;
  direccion: string;
  razon_social: string;
  cuit: string;
  iva_condicion: string; // 'M' | 'RI' | 'CF' | 'EX' | ...
  iva_emails: string;
  iibb?: string;
  fecha_inicio: string; // 'DD/MM/YYYY'
  factura_afip: 'S' | 'N';
  es_agente_retencion: 'S' | 'N';
  esta_activo: 'S' | 'N';
  es_predeterminado: 'S' | 'N';
  conceptos_tipo: 'PS' | 'P' | 'S';
  // Solo incluir si es una URL válida — tusfacturas valida el formato.
  webhook?: string;
  // Todas las propiedades opcionales; si no se pasa `factura`, se usan defaults de tusfacturas.
  factura?: {
    leyenda_general_predeterminada?: string;
    titulo?: string;
    subtitulo?: string;
    reply_to_email?: string;
    reply_to?: string;
    mensaje?: string;
    copias?: string;
  };
};

export type TusFacturasPuntoVentaResponse = {
  error: 'S' | 'N';
  errores?: string[];
  rta?: string;
  // Credenciales específicas del POS recién creado/modificado.
  // Las guardamos por guardería para emitir facturas con el POS correcto.
  apikey?: number | string;
  apitoken?: string;
  usertoken?: string;
  envio_instructivo?: 'S' | 'N';
};

export async function administrarPuntoVenta(
  input: TusFacturasPuntoVentaInput,
  creds: TusFacturasCredentials = getCredentialsFromEnv(),
): Promise<TusFacturasPuntoVentaResponse> {
  const res = await fetch(`${TUSFACTURAS_BASE}/puntos_venta/administrar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...creds, ...input }),
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`tusfacturas HTTP ${res.status}`);
  }

  const data = (await res.json()) as TusFacturasPuntoVentaResponse;
  if (data.error === 'S') {
    const msg = data.errores?.join(' · ') ?? data.rta ?? 'Error al administrar el punto de venta';
    throw new Error(msg);
  }
  return data;
}

// ─── Certificado de enlace con AFIP ─────────────────────────────────────────

// El response del endpoint no está documentado por tusfacturas — vamos a
// loguear el payload crudo la primera vez y ajustar el tipo si hace falta.
export type TusFacturasCertificadoResponse = {
  error?: 'S' | 'N';
  errores?: string[];
  rta?: string;
  // Cualquier otro campo que TF devuelva queda en el payload crudo.
  [key: string]: unknown;
};

/**
 * Solicita el certificado de enlace con AFIP/ARCA para el CUIT asociado
 * a las creds. Tusfacturas genera el certificado y manda el resultado
 * (con instrucciones, según ellos) al mail del usuario administrador.
 *
 * Las creds deben ser las propias del POS de la guarderia, no las
 * master de NauticaApp — cada guardería gestiona su propio CUIT.
 */
export async function solicitarCertificadoEnlace(
  creds: TusFacturasCredentials = getCredentialsFromEnv(),
): Promise<TusFacturasCertificadoResponse> {
  const res = await fetch(`${TUSFACTURAS_BASE}/puntos_venta/certificado`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(creds),
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`tusfacturas HTTP ${res.status}`);
  }

  const data = (await res.json()) as TusFacturasCertificadoResponse;
  if (data.error === 'S') {
    const msg = data.errores?.join(' · ') ?? data.rta ?? 'Error al solicitar el certificado';
    throw new Error(msg);
  }
  return data;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Formatea Date | ISO a 'DD/MM/YYYY' que requiere tusfacturas.
 *
 * - Si recibe un string 'YYYY-MM-DD' (formato de inputs date), lo trata como
 *   fecha civil sin zona horaria — evita el off-by-one que generaba `new Date(...)`.
 * - Para Date u otros strings, convierte a TZ Argentina antes de extraer dd/mm/yyyy
 *   (ver regla 5 de CLAUDE.md: postgres guarda en UTC, mostrar en hora local).
 */
export function toTusFecha(d: Date | string | null | undefined): string {
  if (!d) d = new Date();

  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  }

  const date = typeof d === 'string' ? new Date(d) : d;
  const parts = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(date);
  const dd = parts.find((p) => p.type === 'day')!.value;
  const mm = parts.find((p) => p.type === 'month')!.value;
  const yyyy = parts.find((p) => p.type === 'year')!.value;
  return `${dd}/${mm}/${yyyy}`;
}
