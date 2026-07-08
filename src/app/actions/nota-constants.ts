// Sin 'use server': facturacion.ts (que sí lo tiene) solo puede exportar
// async functions — un const como MOTIVO_NOTA_LABEL rompe el build de
// Next.js/Turbopack en runtime aunque el typecheck pase. Se comparte desde
// aquí entre la action y el cliente (ventas-client.tsx).

export type MotivoNota =
  | 'anulacion_total'
  | 'descuento_parcial'
  | 'devolucion_servicio'
  | 'error_facturacion'
  | 'bonificacion'
  | 'cargo_extra';

export const MOTIVO_NOTA_LABEL: Record<MotivoNota, string> = {
  anulacion_total: 'Anulación total',
  descuento_parcial: 'Descuento parcial',
  devolucion_servicio: 'Devolución de servicio',
  error_facturacion: 'Error de facturación',
  bonificacion: 'Bonificación',
  cargo_extra: 'Cargo extra',
};
