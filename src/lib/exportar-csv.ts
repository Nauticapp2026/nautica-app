/**
 * Descarga de un CSV desde el navegador.
 *
 * Estaba escrito a mano en Ventas y hacía falta en Cuenta Corriente y en
 * Cobranzas — el cliente pidió "el mismo botón de exportación que ya existe en
 * Ventas" (2026-09-02), así que el mismo comportamiento tiene que salir del
 * mismo lugar y no de tres copias.
 *
 * Dos detalles que se pierden fácil al reescribirlo y que Excel necesita:
 *  - El **BOM** al principio, o Excel abre los acentos como mojibake.
 *  - Las comillas dobles **escapadas duplicándolas**, o una descripción con `"`
 *    parte la fila en columnas.
 */

const BOM = '﻿';

function escapar(valor: string): string {
  return `"${valor.replace(/"/g, '""')}"`;
}

/**
 * Arma el CSV y lo descarga. `filas` son valores ya formateados (fechas legibles,
 * importes como los muestra la pantalla): el CSV tiene que decir lo mismo que la
 * tabla que el usuario está viendo.
 *
 * `nombre` va sin extensión ni fecha: se le agrega `-YYYY-MM-DD.csv`.
 */
export function descargarCsv(nombre: string, columnas: string[], filas: string[][]): void {
  const lineas = [columnas.map(escapar).join(',')];
  for (const fila of filas) lineas.push(fila.map(escapar).join(','));
  const csv = BOM + lineas.join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nombre}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
