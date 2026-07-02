// Helpers de cálculo de IVA para el tarifario.
//
// `servicios.precio` se carga y se guarda SIN IVA (neto). El monto que
// efectivamente se le cobra al socio (cuenta corriente, cron mensual,
// facturación) se calcula sumando la alícuota del servicio sobre ese neto.

export function precioConIva(precioNeto: number, alicuotaIva: number): number {
  return Math.round(precioNeto * (1 + alicuotaIva / 100) * 100) / 100;
}

export function precioSinIva(precioConIva: number, alicuotaIva: number): number {
  if (!alicuotaIva) return precioConIva;
  return Math.round((precioConIva / (1 + alicuotaIva / 100)) * 100) / 100;
}
