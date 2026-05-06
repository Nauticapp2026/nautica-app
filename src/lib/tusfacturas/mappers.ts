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
// Códigos oficiales tusfacturas/AFIP. Si se manda '214' (Otra), buildCliente
// agrega `condicion_pago_otra` con la descripción.
export const CONDICION_PAGO_API: Record<string, string> = {
  contado: '201',
  cuenta_corriente: '205',
  tarjeta_credito: '211',
  tarjeta_debito: '212',
  transferencia_bancaria: '210',
  mercadopago: '216',
  payway: '217',
  dias_5: '213',
  dias_10: '206',
  dias_15: '207',
  dias_20: '209',
  dias_30: '202',
  dias_45: '208',
  dias_60: '203',
  dias_90: '204',
  otros: '214',
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
