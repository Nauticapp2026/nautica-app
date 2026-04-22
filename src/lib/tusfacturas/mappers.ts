/**
 * Mapeos entre nuestros enums (DB) y los códigos que usa la API de tusfacturas.app.
 */

// tipo_factura (db) → 'FACTURA A' | 'FACTURA B' | 'FACTURA C'
export const TIPO_FACTURA_API: Record<string, string> = {
  factura_a: 'FACTURA A',
  factura_b: 'FACTURA B',
  factura_c: 'FACTURA C',
};

// tipo_documento (db) → tusfacturas documento_tipo
export const TIPO_DOC_API: Record<string, string> = {
  dni: 'DNI',
  cuit: 'CUIT',
  cuil: 'CUIL',
  pasaporte: 'PASAPORTE',
  cdi: 'CDI',
};

// condicion_frente_iva (db) → tusfacturas condicion_iva
export const CONDICION_IVA_API: Record<string, string> = {
  consumidor_final: 'CF',
  responsable_inscripto: 'RI',
  monotributo: 'M',
  exento: 'EX',
  cliente_exterior: 'E',
  iva_no_alcanzado: 'NC',
};

// condicion_venta (db) → tusfacturas condicion_pago
// Los códigos vienen de la tabla interna de tusfacturas (ver docs).
export const CONDICION_PAGO_API: Record<string, string> = {
  contado: '201',
  cuenta_corriente: '202',
  tarjeta_credito: '210',
  tarjeta_debito: '209',
  transferencia_bancaria: '202',
  mercadopago: '202',
  payway: '202',
  dias_5: '211',
  dias_10: '211',
  dias_15: '211',
  dias_20: '211',
  dias_30: '211',
  dias_45: '211',
  dias_60: '211',
  dias_90: '211',
  otros: '201',
};

// forma de pago (db medio_pago) → descripcion humana que va en pagos.formas_pago
export const FORMA_PAGO_LABEL: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta_credito: 'Tarjeta de crédito',
  tarjeta_debito: 'Tarjeta de débito',
  debito_automatico: 'Débito automático',
  transferencia: 'Transferencia',
  cheque: 'Cheque',
};
