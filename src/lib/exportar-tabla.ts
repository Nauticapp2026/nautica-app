/**
 * Exportación de una tabla desde el navegador, en tres formatos: CSV, Excel
 * (.xlsx) y PDF.
 *
 * Nació como `exportar-csv.ts` cuando el cliente pidió "el mismo botón de
 * exportación que ya existe en Ventas" para Cuenta Corriente y Cobranzas
 * (2026-09-02). Después pidió poder elegir la extensión (2026-09-15), así que
 * el mismo par (columnas, filas) sale por tres caminos distintos — y sigue
 * viviendo en un solo lugar para que Ventas, Cobranzas y Cuenta Corriente
 * exporten idéntico.
 *
 * `filas` son valores YA formateados (fechas legibles, importes como los muestra
 * la pantalla): el archivo tiene que decir exactamente lo que la tabla que el
 * usuario está viendo. Por eso el Excel guarda texto y no números: el importe
 * "$1.234,50" o el saldo "-$1,00" salen tal cual, sin que Excel los reinterprete
 * (un CUIT de 11 dígitos como número se muestra "2,02E+10").
 *
 * Excel y PDF cargan su librería con `import()` recién al exportar: exceljs y
 * jspdf pesan bastante y no tiene sentido pagarlos en cada carga de página por
 * un botón que se usa de vez en cuando.
 */

export type FormatoExportacion = 'csv' | 'xlsx' | 'pdf';

export const FORMATOS_EXPORTACION: {
  value: FormatoExportacion;
  label: string;
  detalle: string;
}[] = [
  { value: 'xlsx', label: 'Excel', detalle: 'Planilla .xlsx, lista para filtrar y sumar' },
  { value: 'pdf', label: 'PDF', detalle: 'Para imprimir o enviar tal cual se ve' },
  { value: 'csv', label: 'CSV', detalle: 'Texto plano, para importar en otro sistema' },
];

export type TablaExportable = {
  /** Nombre base del archivo, sin extensión ni fecha: se agrega `-YYYY-MM-DD.ext`. */
  nombre: string;
  /** Título legible: encabezado del PDF y nombre de la hoja del Excel. */
  titulo: string;
  columnas: string[];
  filas: string[][];
};

export async function exportarTabla(
  formato: FormatoExportacion,
  tabla: TablaExportable,
): Promise<void> {
  switch (formato) {
    case 'csv':
      return descargarCsv(tabla);
    case 'xlsx':
      return descargarXlsx(tabla);
    case 'pdf':
      return descargarPdf(tabla);
  }
}

// ─── Común ──────────────────────────────────────────────────────────────────

function nombreArchivo(nombre: string, ext: string): string {
  return `${nombre}-${new Date().toISOString().slice(0, 10)}.${ext}`;
}

function descargarBlob(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

function fechaGeneracion(): string {
  return new Date().toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── CSV ────────────────────────────────────────────────────────────────────

// Dos detalles que se pierden fácil al reescribirlo y que Excel necesita:
//  - El BOM al principio, o Excel abre los acentos como mojibake.
//  - Las comillas dobles escapadas duplicándolas, o una descripción con `"`
//    parte la fila en columnas.
const BOM = '﻿';

function escaparCsv(valor: string): string {
  return `"${valor.replace(/"/g, '""')}"`;
}

function descargarCsv({ nombre, columnas, filas }: TablaExportable): void {
  const lineas = [columnas.map(escaparCsv).join(',')];
  for (const fila of filas) lineas.push(fila.map(escaparCsv).join(','));
  const csv = BOM + lineas.join('\n');
  descargarBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), nombreArchivo(nombre, 'csv'));
}

// ─── Excel ──────────────────────────────────────────────────────────────────

// Excel limita el nombre de hoja a 31 caracteres y prohíbe : \ / ? * [ ]
function nombreHoja(titulo: string): string {
  return (
    titulo
      .replace(/[:\\/?*[\]]/g, ' ')
      .trim()
      .slice(0, 31) || 'Datos'
  );
}

async function descargarXlsx({ nombre, titulo, columnas, filas }: TablaExportable): Promise<void> {
  const ExcelJS = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'NauticApp';
  wb.created = new Date();
  const ws = wb.addWorksheet(nombreHoja(titulo));

  const header = ws.addRow(columnas);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF175861' } };
  header.alignment = { vertical: 'middle' };
  ws.addRows(filas);

  // Ancho por columna según el contenido más largo, con piso y techo: sin
  // esto Excel abre todo en 8,43 y hay que arrastrar cada columna a mano.
  ws.columns.forEach((col, i) => {
    let max = columnas[i]?.length ?? 0;
    for (const fila of filas) max = Math.max(max, (fila[i] ?? '').length);
    col.width = Math.min(50, Math.max(10, max + 2));
  });
  // Encabezado fijo al hacer scroll y filtros listos en cada columna.
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };

  const buffer = await wb.xlsx.writeBuffer();
  descargarBlob(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    nombreArchivo(nombre, 'xlsx'),
  );
}

// ─── PDF ────────────────────────────────────────────────────────────────────

async function descargarPdf({ nombre, titulo, columnas, filas }: TablaExportable): Promise<void> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  // Apaisado: estas tablas tienen entre 6 y 12 columnas y en vertical no entran.
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const margen = 36;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(16, 24, 40);
  doc.text(titulo, margen, 40);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(102, 112, 133);
  doc.text(
    `Generado el ${fechaGeneracion()} · ${filas.length} ${filas.length === 1 ? 'fila' : 'filas'}`,
    margen,
    56,
  );

  autoTable(doc, {
    head: [columnas],
    body: filas,
    startY: 70,
    margin: { left: margen, right: margen, bottom: 40 },
    styles: { fontSize: 7.5, cellPadding: 4, overflow: 'linebreak', textColor: [16, 24, 40] },
    headStyles: { fillColor: [23, 88, 97], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [246, 248, 248] },
    // Se repite el encabezado en cada página y se corta por fila, no a mitad
    // de una celda.
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
  });

  // Pie con numeración: sin esto una tabla de 8 páginas impresa se desordena.
  const paginas = doc.getNumberOfPages();
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(152, 162, 179);
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    doc.text(`Página ${p} de ${paginas}`, ancho - margen, alto - 20, { align: 'right' });
    doc.text('NauticApp', margen, alto - 20);
  }

  doc.save(nombreArchivo(nombre, 'pdf'));
}
