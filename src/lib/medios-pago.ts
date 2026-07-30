// Lista canónica de medios de pago (matchea el enum `medio_pago` de la DB y el
// map FORMAS_PAGO_LABEL de movimientos.ts). Vive en un módulo sin directiva
// para poder importarse tanto desde client components (forma-pago.tsx la
// re-exporta como FORMAS_PAGO) como desde server actions, que no pueden
// importar módulos 'use client'.
export const MEDIOS_PAGO = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta_credito', label: 'Tarjeta de crédito' },
  { value: 'tarjeta_debito', label: 'Tarjeta de débito' },
  { value: 'debito_automatico', label: 'Débito automático' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'mercado_pago', label: 'Mercado Pago' },
] as const;

export type MedioPagoValue = (typeof MEDIOS_PAGO)[number]['value'];

export const MEDIO_PAGO_VALUES: string[] = MEDIOS_PAGO.map((m) => m.value);
