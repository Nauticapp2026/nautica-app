// Helpers de cálculo de IVA para el tarifario.
//
// `servicios.precio` se carga y se guarda como el PRECIO FINAL: es lo que paga
// el socio, IVA incluido. El IVA no se suma encima — se discrimina hacia
// adentro de ese monto según la alícuota del servicio y la condición frente al
// IVA del club/socio, al momento de emitir el comprobante (ver
// `desglosarMontos` en actions/facturacion.ts).
//
// Antes el precio se guardaba neto y se le sumaba la alícuota, así que el mismo
// servicio le salía más caro a un Responsable Inscripto que a un Consumidor
// Final. Cambiado por pedido del cliente (2026-08-13): el precio de lista es
// uno solo y todos pagan lo mismo.

// Saca el neto de un precio que ya tiene el IVA adentro.
export function precioSinIva(precioConIva: number, alicuotaIva: number): number {
  if (!alicuotaIva) return precioConIva;
  return Math.round((precioConIva / (1 + alicuotaIva / 100)) * 100) / 100;
}

// El IVA contenido en un precio final.
export function ivaContenido(precioFinal: number, alicuotaIva: number): number {
  if (!alicuotaIva) return 0;
  return Math.round((precioFinal - precioSinIva(precioFinal, alicuotaIva)) * 100) / 100;
}
