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
  documento_tipo: string; // 'DNI' | 'CUIT' | 'CUIL' | 'PASAPORTE' | 'CDI' | 'OTRO'
  documento_nro: string;
  razon_social: string;
  email: string;
  domicilio: string;
  provincia: string; // código: '2' = CABA, '1' = Buenos Aires, etc.
  envia_por_mail: 'S' | 'N';
  reclama_deuda: 'S' | 'N';
  condicion_pago: string; // '201' contado, '211' 30 días, etc.
  condicion_iva: string; // 'CF' | 'RI' | 'M' | 'EX' | 'E' | 'NC'
  condicion_iva_operacion: string; // '1' Gravada
};

export type TusFacturasDetalleItem = {
  cantidad: number;
  producto: {
    descripcion: string;
    codigo: string;
    lista_precios: string; // 'standard'
    leyenda: string;
    unidad_bulto: number;
    alicuota: string; // '21'
    precio_unitario_sin_iva: number;
  };
  leyenda: string;
  tratamiento_descuento: string; // 'A'
  bonificacion_porcentaje: number;
};

export type TusFacturasFormaPago = {
  descripcion: string;
  importe: number;
};

export type TusFacturasComprobante = {
  fecha: string; // 'DD/MM/YYYY'
  vencimiento: string; // 'DD/MM/YYYY'
  tipo: string; // 'FACTURA A' | 'FACTURA B' | 'FACTURA C'
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
  pagos: {
    formas_pago: TusFacturasFormaPago[];
    total: number;
  };
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

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Formatea Date | ISO a 'DD/MM/YYYY' que requiere tusfacturas. */
export function toTusFecha(d: Date | string | null | undefined): string {
  if (!d) d = new Date();
  const date = typeof d === 'string' ? new Date(d) : d;
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = date.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
