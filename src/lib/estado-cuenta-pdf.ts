/**
 * PDF "Estado de cuenta" de un socio, generado en el navegador.
 *
 * Es el documento que el club imprime o le manda por mail al socio (pedido del
 * cliente 2026-09-15). A diferencia de la exportación genérica (exportar-tabla,
 * que baja "la tabla tal cual"), esto es un documento con membrete: quién lo
 * emite, a quién, cuándo, qué período cubre, los movimientos y el saldo final.
 *
 * Se genera del lado del cliente y no en el server a propósito: las filas ya
 * están calculadas y filtradas en la pantalla (FIFO, consolidación por
 * comprobante, filtros de fecha/estado), y el documento tiene que decir EXACTO
 * lo que el admin está viendo cuando aprieta el botón. Para mandarlo por mail,
 * el mismo PDF viaja al server como adjunto (ver enviarEstadoCuentaAction).
 *
 * jspdf se carga con import() recién acá: pesa y solo se usa al pedir el
 * documento.
 */

export type DatosEstadoCuenta = {
  club: { nombre: string; cuit?: string | null; direccion?: string | null };
  socio: {
    nombre: string;
    numeroSocio?: number | null;
    documento?: string | null;
    email?: string | null;
  };
  /** Rango aplicado en la pantalla (si hay filtro de fechas). Formato YYYY-MM-DD. */
  periodo?: { desde?: string | null; hasta?: string | null };
  columnas: string[];
  filas: string[][];
  resumen: {
    ventas: string;
    cobranzas: string;
    /** Texto final ya formateado, con signo ("$1.234,50" / "-$500,00"). */
    saldo: string;
    /** "Saldo deudor" / "Saldo a favor" / "Saldo". */
    saldoLabel: string;
  };
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

export function nombreArchivoEstadoCuenta(socioNombre: string): string {
  const slug = socioNombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return `estado-cuenta-${slug || 'socio'}-${new Date().toISOString().slice(0, 10)}.pdf`;
}

export async function generarEstadoCuentaPdf(datos: DatosEstadoCuenta): Promise<Blob> {
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
  doc.text('Estado de cuenta', ancho - margen, 42, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(102, 112, 133);
  doc.text(`Emitido el ${fechaLarga()}`, ancho - margen, 56, { align: 'right' });

  // ── Bloque del socio ─────────────────────────────────────────────────────
  const yBloque = 76;
  doc.setDrawColor(229, 231, 235);
  doc.setFillColor(246, 248, 248);
  doc.roundedRect(margen, yBloque, ancho - margen * 2, 46, 6, 6, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(16, 24, 40);
  const socioLinea = `${datos.socio.nombre}${
    datos.socio.numeroSocio != null ? `  ·  Socio #${datos.socio.numeroSocio}` : ''
  }`;
  doc.text(socioLinea, margen + 12, yBloque + 19);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(102, 112, 133);
  const socioDetalle = [
    datos.socio.documento ? `Documento ${datos.socio.documento}` : null,
    datos.socio.email || null,
  ]
    .filter(Boolean)
    .join(' · ');
  if (socioDetalle) doc.text(socioDetalle, margen + 12, yBloque + 34);

  const { desde, hasta } = datos.periodo ?? {};
  const periodoTexto =
    desde && hasta
      ? `Período: ${ymdALegible(desde)} al ${ymdALegible(hasta)}`
      : desde
        ? `Período: desde el ${ymdALegible(desde)}`
        : hasta
          ? `Período: hasta el ${ymdALegible(hasta)}`
          : 'Todos los movimientos';
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(23, 88, 97);
  doc.text(periodoTexto, ancho - margen - 12, yBloque + 19, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(102, 112, 133);
  doc.text(
    `${datos.filas.length} ${datos.filas.length === 1 ? 'movimiento' : 'movimientos'}`,
    ancho - margen - 12,
    yBloque + 34,
    { align: 'right' },
  );

  // ── Movimientos ──────────────────────────────────────────────────────────
  autoTable(doc, {
    head: [datos.columnas],
    body: datos.filas,
    startY: yBloque + 60,
    margin: { left: margen, right: margen, bottom: 90 },
    styles: { fontSize: 7.5, cellPadding: 4, overflow: 'linebreak', textColor: [16, 24, 40] },
    headStyles: { fillColor: [23, 88, 97], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [246, 248, 248] },
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
  });

  // ── Resumen ──────────────────────────────────────────────────────────────
  // Va después de la tabla; si no entra en la página actual, pasa a una nueva
  // en vez de pisar el pie.
  type ConAutoTable = { lastAutoTable?: { finalY?: number } };
  const finalY = (doc as unknown as ConAutoTable).lastAutoTable?.finalY ?? yBloque + 60;
  const altoResumen = 58;
  let yResumen = finalY + 16;
  if (yResumen + altoResumen > alto - 40) {
    doc.addPage();
    yResumen = 40;
  }
  const anchoCaja = 240;
  const xCaja = ancho - margen - anchoCaja;
  doc.setDrawColor(229, 231, 235);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(xCaja, yResumen, anchoCaja, altoResumen, 6, 6, 'FD');

  const filaResumen = (label: string, valor: string, y: number, destacada = false) => {
    doc.setFont('helvetica', destacada ? 'bold' : 'normal');
    doc.setFontSize(destacada ? 10.5 : 9);
    doc.setTextColor(destacada ? 16 : 102, destacada ? 24 : 112, destacada ? 40 : 133);
    doc.text(label, xCaja + 12, y);
    doc.text(valor, xCaja + anchoCaja - 12, y, { align: 'right' });
  };
  filaResumen('Ventas', datos.resumen.ventas, yResumen + 15);
  filaResumen('Cobranzas', datos.resumen.cobranzas, yResumen + 29);
  doc.setDrawColor(229, 231, 235);
  doc.line(xCaja + 12, yResumen + 36, xCaja + anchoCaja - 12, yResumen + 36);
  filaResumen(datos.resumen.saldoLabel, datos.resumen.saldo, yResumen + 50, true);

  // ── Pie ──────────────────────────────────────────────────────────────────
  const paginas = doc.getNumberOfPages();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(152, 162, 179);
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    doc.text(`${datos.club.nombre} · Estado de cuenta de ${datos.socio.nombre}`, margen, alto - 20);
    doc.text(`Página ${p} de ${paginas}`, ancho - margen, alto - 20, { align: 'right' });
  }

  return doc.output('blob');
}

/** Blob → base64 (sin el prefijo data:), para mandar el PDF a un server action. */
export async function blobABase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binario = '';
  // Por tramos: String.fromCharCode(...bytes) revienta la pila con archivos grandes.
  const tramo = 0x8000;
  for (let i = 0; i < bytes.length; i += tramo) {
    binario += String.fromCharCode(...bytes.subarray(i, i + tramo));
  }
  return btoa(binario);
}
