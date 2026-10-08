/**
 * PDF "Cierre de caja" de Tesorería, generado en el navegador.
 *
 * Reemplaza el cierre que el cliente (Canestrari) armaba a mano en Excel: por
 * cada instrumento, saldo inicial, ingresos, egresos y saldo final; el
 * consolidado de todas las cajas; y abajo el detalle de movimientos tal cual
 * se ve en la pantalla. Membrete con nombre, CUIT y fecha de emisión.
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
  club: { nombre: string; cuit?: string | null; direccion?: string | null };
  /** YYYY-MM-DD o null. */
  periodo: { desde: string | null; hasta: string | null };
  resumen: FilaResumenCierre[];
  consolidado: FilaResumenCierre;
  columnas: string[];
  filas: string[][];
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

export function nombreArchivoCierreCaja(periodo: {
  desde: string | null;
  hasta: string | null;
}): string {
  const sufijo = periodo.desde
    ? periodo.hasta && periodo.hasta !== periodo.desde
      ? `${periodo.desde}-al-${periodo.hasta}`
      : periodo.desde
    : new Date().toISOString().slice(0, 10);
  return `cierre-de-caja-${sufijo}.pdf`;
}

export async function generarCierreCajaPdf(datos: DatosCierreCaja): Promise<void> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const margen = 36;
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();

  // ── Membrete ─────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(23, 88, 97);
  doc.text(datos.club.nombre, margen, 42);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(102, 112, 133);
  const lineaClub = [
    datos.club.cuit ? `CUIT ${datos.club.cuit}` : null,
    datos.club.direccion?.trim() || null,
  ]
    .filter(Boolean)
    .join(' · ');
  if (lineaClub) doc.text(lineaClub, margen, 56);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(16, 24, 40);
  doc.text('Cierre de caja', ancho - margen, 42, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(102, 112, 133);
  doc.text(`Emitido el ${fechaLarga()}`, ancho - margen, 56, { align: 'right' });

  // ── Período ──────────────────────────────────────────────────────────────
  const yBloque = 72;
  doc.setDrawColor(229, 231, 235);
  doc.setFillColor(246, 248, 248);
  doc.roundedRect(margen, yBloque, ancho - margen * 2, 30, 6, 6, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(23, 88, 97);
  doc.text(textoPeriodo(datos.periodo), margen + 12, yBloque + 19);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(102, 112, 133);
  doc.text(
    `${datos.filas.length} ${datos.filas.length === 1 ? 'movimiento' : 'movimientos'}`,
    ancho - margen - 12,
    yBloque + 19,
    { align: 'right' },
  );

  // ── Resumen por instrumento + consolidado ────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(16, 24, 40);
  doc.text('Saldos por instrumento', margen, yBloque + 50);

  const filaResumen = (r: FilaResumenCierre) => [
    r.instrumento,
    r.saldoInicial,
    r.ingresos,
    r.egresos,
    r.saldoFinal,
  ];
  autoTable(doc, {
    head: [['Instrumento', 'Saldo inicial', 'Ingresos', 'Egresos', 'Saldo final']],
    body: [
      ...datos.resumen.map(filaResumen),
      filaResumen({ ...datos.consolidado, instrumento: 'Consolidado (todas las cajas)' }),
    ],
    startY: yBloque + 58,
    margin: { left: margen, right: margen, bottom: 40 },
    styles: { fontSize: 8.5, cellPadding: 5, textColor: [16, 24, 40] },
    headStyles: { fillColor: [23, 88, 97], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      // Última fila = consolidado, destacada.
      if (data.section === 'body' && data.row.index === datos.resumen.length) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [233, 241, 241];
      }
    },
  });

  // ── Detalle de movimientos ───────────────────────────────────────────────
  type ConAutoTable = { lastAutoTable?: { finalY?: number } };
  let y = ((doc as unknown as ConAutoTable).lastAutoTable?.finalY ?? yBloque + 58) + 24;
  if (y + 60 > alto - 40) {
    doc.addPage();
    y = 40;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(16, 24, 40);
  doc.text('Detalle de movimientos', margen, y);

  const colsDerecha = new Set(
    datos.columnas
      .map((c, i) => (['Ingreso', 'Egreso', 'Saldo', 'Monto'].includes(c) ? i : -1))
      .filter((i) => i >= 0),
  );
  autoTable(doc, {
    head: [datos.columnas],
    body: datos.filas,
    startY: y + 8,
    margin: { left: margen, right: margen, bottom: 40 },
    styles: { fontSize: 7.5, cellPadding: 4, overflow: 'linebreak', textColor: [16, 24, 40] },
    headStyles: { fillColor: [23, 88, 97], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [246, 248, 248] },
    columnStyles: Object.fromEntries([...colsDerecha].map((i) => [i, { halign: 'right' }])),
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
  });

  // ── Pie ──────────────────────────────────────────────────────────────────
  const paginas = doc.getNumberOfPages();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(152, 162, 179);
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    doc.text(
      `${datos.club.nombre} · Cierre de caja · ${textoPeriodo(datos.periodo)}`,
      margen,
      alto - 20,
    );
    doc.text(`Página ${p} de ${paginas}`, ancho - margen, alto - 20, { align: 'right' });
  }

  doc.save(nombreArchivoCierreCaja(datos.periodo));
}
