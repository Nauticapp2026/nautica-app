/**
 * PDF "Cierre y Movimientos de Caja" de Tesorería, generado en el navegador.
 *
 * Reemplaza el cierre que el cliente (Canestrari) armaba a mano en Excel: por
 * cada instrumento, saldo inicial, ingresos, egresos y saldo final; el
 * consolidado; y abajo el detalle de movimientos con sus totales. Cada hoja
 * lleva membrete (nombre, CUIT y dirección del club, y la leyenda del
 * documento) y numeración; la última hoja cierra con el bloque de firmas del
 * Responsable de Tesorería y del Responsable Aprobador, las observaciones, y
 * la fecha del día y el lugar (ajustes del cliente, 2026-10-13).
 *
 * Mismo criterio que estado-cuenta-pdf.ts: se genera del lado del cliente con
 * las filas ya calculadas y filtradas en la pantalla, y jspdf se carga con
 * import() recién al pedir el documento.
 */

export type FilaResumenCierre = {
  instrumento: string;
  saldoInicial: string;
  ingresos: string;
  egresos: string;
  saldoFinal: string;
};

export type DatosCierreCaja = {
  club: {
    nombre: string;
    cuit?: string | null;
    direccion?: string | null;
    /** Ciudad del club: se imprime como "Lugar" junto a la fecha. */
    lugar?: string | null;
  };
  /** YYYY-MM-DD o null. */
  periodo: { desde: string | null; hasta: string | null };
  /**
   * Lo que se eligió en el desplegable del cierre: "Resumen" o el nombre de un
   * instrumento. Sale en el campo Instrumento y en la fila Consolidado.
   */
  seleccion: string;
  /** true = Resumen (todas las cajas del filtro); false = un instrumento solo. */
  esResumen: boolean;
  resumen: FilaResumenCierre[];
  consolidado: FilaResumenCierre;
  columnas: string[];
  filas: string[][];
  /** Totales de las columnas Ingreso y Egreso del detalle (y en USD si hay). */
  totales: { ingresos: string; egresos: string; ingresosUsd?: string; egresosUsd?: string };
};

function fechaLarga(d = new Date()): string {
  return d.toLocaleDateString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function ymdALegible(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}

export function textoPeriodo(periodo: { desde: string | null; hasta: string | null }): string {
  const { desde, hasta } = periodo;
  if (desde && hasta) {
    return desde === hasta
      ? `Día ${ymdALegible(desde)}`
      : `Del ${ymdALegible(desde)} al ${ymdALegible(hasta)}`;
  }
  if (desde) return `Desde el ${ymdALegible(desde)}`;
  if (hasta) return `Hasta el ${ymdALegible(hasta)}`;
  return 'Todos los movimientos';
}

export function nombreArchivoCierreCaja(
  periodo: { desde: string | null; hasta: string | null },
  instrumento: string | null = null,
): string {
  const sufijo = periodo.desde
    ? periodo.hasta && periodo.hasta !== periodo.desde
      ? `${periodo.desde}-al-${periodo.hasta}`
      : periodo.desde
    : new Date().toISOString().slice(0, 10);
  const slug = instrumento
    ? `-${instrumento
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase()}`
    : '';
  return `cierre-de-caja${slug}-${sufijo}.pdf`;
}

/** Leyenda del documento, en el margen derecho del membrete de cada hoja. */
const LEYENDA = 'Cierre y Movimientos de Caja';
/** Alto reservado arriba de cada hoja para el membrete. */
const ALTO_MEMBRETE = 80;
/** Alto del bloque final (firmas + observaciones + fecha y lugar). */
const ALTO_BLOQUE_FINAL = 144;

export async function generarCierreCajaPdf(datos: DatosCierreCaja): Promise<void> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const margen = 36;
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  const textoSeleccion = datos.esResumen ? 'Resumen' : datos.seleccion;

  // ── Período e instrumento seleccionado (solo primera hoja) ───────────────
  const yBloque = ALTO_MEMBRETE - 4;
  doc.setDrawColor(229, 231, 235);
  doc.setFillColor(246, 248, 248);
  doc.roundedRect(margen, yBloque, ancho - margen * 2, 44, 6, 6, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(23, 88, 97);
  doc.text(textoPeriodo(datos.periodo), margen + 12, yBloque + 17);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(102, 112, 133);
  const etiquetaInstrumento = 'Instrumento:';
  doc.text(etiquetaInstrumento, margen + 12, yBloque + 34);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(16, 24, 40);
  doc.text(textoSeleccion, margen + 12 + doc.getTextWidth(etiquetaInstrumento) + 4, yBloque + 34);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(102, 112, 133);
  doc.text(
    `${datos.filas.length} ${datos.filas.length === 1 ? 'movimiento' : 'movimientos'}`,
    ancho - margen - 12,
    yBloque + 17,
    { align: 'right' },
  );

  // ── Saldos por instrumento + consolidado ─────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(16, 24, 40);
  doc.text(
    datos.esResumen ? 'Saldos por instrumento' : `Saldos de ${datos.seleccion}`,
    margen,
    yBloque + 66,
  );

  const filaResumen = (r: FilaResumenCierre) => [
    r.instrumento,
    r.saldoInicial,
    r.ingresos,
    r.egresos,
    r.saldoFinal,
  ];
  const derechaSaldos = new Set([1, 2, 3, 4]);
  autoTable(doc, {
    head: [['Instrumento', 'Saldo inicial', 'Ingresos', 'Egresos', 'Saldo final']],
    body: [
      ...datos.resumen.map(filaResumen),
      filaResumen({ ...datos.consolidado, instrumento: `Consolidado · ${textoSeleccion}` }),
    ],
    startY: yBloque + 74,
    margin: { top: ALTO_MEMBRETE, left: margen, right: margen, bottom: 40 },
    styles: { fontSize: 8.5, cellPadding: 5, textColor: [16, 24, 40] },
    headStyles: { fillColor: [23, 88, 97], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      1: { halign: 'right', cellWidth: 120 },
      2: { halign: 'right', cellWidth: 120 },
      3: { halign: 'right', cellWidth: 120 },
      4: { halign: 'right', cellWidth: 120, fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      // columnStyles no llega al encabezado: sin esto "Saldo inicial" queda a la
      // izquierda de importes alineados a la derecha.
      if (data.section === 'head' && derechaSaldos.has(data.column.index)) {
        data.cell.styles.halign = 'right';
      }
      // Última fila = consolidado, destacada.
      if (data.section === 'body' && data.row.index === datos.resumen.length) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [233, 241, 241];
      }
    },
  });

  // ── Detalle de movimientos ───────────────────────────────────────────────
  type ConAutoTable = { lastAutoTable?: { finalY?: number } };
  const finalAutoTable = () =>
    (doc as unknown as ConAutoTable).lastAutoTable?.finalY ?? yBloque + 74;
  let y = finalAutoTable() + 24;
  if (y + 60 > alto - 40) {
    doc.addPage();
    y = ALTO_MEMBRETE + 10;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(16, 24, 40);
  doc.text('Detalle de movimientos', margen, y);

  const colsDerecha = new Set(
    datos.columnas
      .map((c, i) => (['Ingreso', 'Egreso', 'Monto'].includes(c) ? i : -1))
      .filter((i) => i >= 0),
  );
  const iIngreso = datos.columnas.indexOf('Ingreso');
  // Etiqueta de totales: ocupa todas las columnas hasta el primer importe.
  const spanEtiqueta = iIngreso >= 0 ? iIngreso : Math.max(datos.columnas.length - 2, 1);
  const filaTotal = (etiqueta: string, ingresos: string, egresos: string) => [
    {
      content: etiqueta,
      colSpan: spanEtiqueta,
      styles: { halign: 'right' as const },
    },
    { content: ingresos, styles: { halign: 'right' as const } },
    { content: egresos, styles: { halign: 'right' as const } },
  ];
  const foot = [filaTotal('Total de movimientos', datos.totales.ingresos, datos.totales.egresos)];
  if (datos.totales.ingresosUsd != null && datos.totales.egresosUsd != null) {
    foot.push(filaTotal('Total en dólares', datos.totales.ingresosUsd, datos.totales.egresosUsd));
  }
  // Anchos fijos para lo que es corto; el Detalle absorbe lo que sobra.
  const anchoPorColumna: Record<string, number> = {
    Fecha: 54,
    Nº: 58,
    Tipo: 44,
    Instrumento: 82,
    Rubro: 84,
    Subrubro: 78,
    Ingreso: 66,
    Egreso: 66,
  };
  autoTable(doc, {
    head: [datos.columnas],
    body: datos.filas,
    foot,
    startY: y + 8,
    margin: { top: ALTO_MEMBRETE, left: margen, right: margen, bottom: 40 },
    styles: { fontSize: 7.5, cellPadding: 4, overflow: 'linebreak', textColor: [16, 24, 40] },
    headStyles: { fillColor: [23, 88, 97], textColor: 255, fontStyle: 'bold' },
    footStyles: {
      fillColor: [233, 241, 241],
      textColor: [16, 24, 40],
      fontStyle: 'bold',
      fontSize: 8,
    },
    alternateRowStyles: { fillColor: [246, 248, 248] },
    columnStyles: Object.fromEntries(
      datos.columnas.map((c, i) => [
        i,
        {
          ...(colsDerecha.has(i) ? { halign: 'right' as const } : {}),
          ...(anchoPorColumna[c] ? { cellWidth: anchoPorColumna[c] } : {}),
        },
      ]),
    ),
    didParseCell: (data) => {
      if (data.section === 'head' && colsDerecha.has(data.column.index)) {
        data.cell.styles.halign = 'right';
      }
    },
    showHead: 'everyPage',
    showFoot: 'lastPage',
    rowPageBreak: 'avoid',
  });

  // ── Bloque final (solo última hoja): firmas, observaciones, fecha y lugar ─
  const yTop = alto - 36 - ALTO_BLOQUE_FINAL;
  if (finalAutoTable() + 10 > yTop) doc.addPage();

  const anchoFirma = 270;
  doc.setLineWidth(0.6);
  doc.setDrawColor(107, 114, 128);
  const bloqueFirma = (x: number, rol: string) => {
    doc.line(x, yTop + 20, x + anchoFirma, yTop + 20);
    doc.line(x, yTop + 62, x + anchoFirma, yTop + 62);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(102, 112, 133);
    doc.text(`Nombre y Apellido · ${rol}`, x, yTop + 31);
    doc.text(`FIRMA · ${rol}`, x, yTop + 73);
  };
  bloqueFirma(margen, 'Responsable de Tesorería');
  bloqueFirma(ancho - margen - anchoFirma, 'Responsable Aprobador');

  const yB = yTop + 90;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(16, 24, 40);
  doc.text('Observaciones', margen, yB + 8);
  doc.setDrawColor(209, 213, 219);
  doc.roundedRect(margen, yB + 12, 400, 42, 3, 3, 'S');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(16, 24, 40);
  doc.text(`Fecha: ${fechaLarga()}`, ancho - margen, yB + 30, { align: 'right' });
  doc.text(
    `Lugar: ${datos.club.lugar?.trim() || '______________________'}`,
    ancho - margen,
    yB + 48,
    {
      align: 'right',
    },
  );

  // ── Membrete y pie en TODAS las hojas ────────────────────────────────────
  const lineaClub = [
    datos.club.cuit ? `CUIT ${datos.club.cuit}` : null,
    datos.club.direccion?.trim() || null,
  ]
    .filter(Boolean)
    .join(' · ');
  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(23, 88, 97);
    doc.text(datos.club.nombre, margen, 40);
    if (lineaClub) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(102, 112, 133);
      doc.text(lineaClub, margen, 54);
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(16, 24, 40);
    doc.text(LEYENDA, ancho - margen, 40, { align: 'right' });
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.8);
    doc.line(margen, 62, ancho - margen, 62);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(152, 162, 179);
    doc.text(
      `${datos.club.nombre} · ${LEYENDA} · ${textoSeleccion} · ${textoPeriodo(datos.periodo)}`,
      margen,
      alto - 20,
    );
    doc.text(`Página ${p} de ${paginas}`, ancho - margen, alto - 20, { align: 'right' });
  }

  doc.save(nombreArchivoCierreCaja(datos.periodo, datos.esResumen ? null : datos.seleccion));
}
