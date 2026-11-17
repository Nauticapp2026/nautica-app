/**
 * PDF de la orden de pago (se genera en el navegador, igual que los demás PDF del panel).
 * Módulo plano: solo recibe datos ya cargados.
 */

import { formatoImporte, formatoMoneda } from '@/lib/cuentas-a-pagar/constantes';
import { formatArgentinaDate } from '@/lib/dates';
import { fechaLegible } from '@/lib/documentacion-fechas';

import type { DetallePago } from './consultas';

export type ClubOrdenPago = {
  nombre: string;
  cuit: string | null;
  direccion: string | null;
};

export async function descargarOrdenDePagoPdf(pago: DetallePago, club: ClubOrdenPago) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const margen = 40;
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();

  // Membrete
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(16, 24, 40);
  doc.text(club.nombre, margen, 48);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(102, 112, 133);
  const sub = [club.cuit ? `CUIT ${club.cuit}` : '', club.direccion ?? '']
    .filter(Boolean)
    .join(' · ');
  if (sub) doc.text(sub, margen, 62);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(23, 88, 97);
  doc.text('ORDEN DE PAGO', ancho - margen, 48, { align: 'right' });
  doc.setFontSize(12);
  doc.text(pago.codigo, ancho - margen, 66, { align: 'right' });
  if (pago.estado === 'anulado') {
    doc.setTextColor(220, 38, 38);
    doc.setFontSize(11);
    doc.text('ANULADA', ancho - margen, 82, { align: 'right' });
  }

  // Datos
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(16, 24, 40);
  let y = 104;
  const linea = (rotulo: string, valor: string) => {
    doc.setFont('helvetica', 'bold');
    doc.text(`${rotulo}:`, margen, y);
    doc.setFont('helvetica', 'normal');
    doc.text(valor, margen + 110, y);
    y += 15;
  };
  linea('Fecha de pago', fechaLegible(pago.fechaPago));
  linea('Proveedor', `${pago.proveedor.codigo} · ${pago.proveedor.nombre}`);
  linea('CUIT', pago.proveedor.cuit ?? '—');
  linea(
    'Moneda',
    pago.moneda === 'DOL'
      ? `Dólares (TC ${pago.tipoCambio ? formatoImporte(pago.tipoCambio) : '—'})`
      : 'Pesos',
  );
  if (pago.estado === 'anulado' && pago.anuladoAt) {
    linea('Anulada el', formatArgentinaDate(pago.anuladoAt));
  }

  // Comprobantes cancelados
  if (pago.aplicaciones.length > 0) {
    autoTable(doc, {
      startY: y + 6,
      margin: { left: margen, right: margen },
      head: [['Comprobante', 'Nº', 'Saldo previo', 'Aplicado', 'Desc./ajuste']],
      body: pago.aplicaciones.map((a) => [
        a.origen === 'anticipo' ? 'Anticipo' : a.tipoLabel,
        a.origen === 'anticipo' ? a.codigo : a.numeroCompleto,
        formatoImporte(a.signo * a.saldoPrevio),
        formatoImporte(a.signo * a.montoAplicado),
        a.signo === 1 ? formatoImporte(a.descuentoAjuste) : '—',
      ]),
      styles: { fontSize: 8.5, cellPadding: 4, textColor: [16, 24, 40] },
      headStyles: { fillColor: [23, 88, 97], textColor: 255 },
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  } else {
    y += 6;
    doc.setFont('helvetica', 'italic');
    doc.text('Anticipo a proveedor (sin comprobantes previos).', margen, y + 8);
    y += 14;
  }

  // Medios de pago
  if (pago.medios.length > 0) {
    autoTable(doc, {
      startY: y + 14,
      margin: { left: margen, right: margen },
      head: [['Medio de pago', 'Detalle', 'Monto']],
      body: pago.medios.map((m) => [m.label, m.detalle, formatoImporte(m.monto)]),
      styles: { fontSize: 8.5, cellPadding: 4, textColor: [16, 24, 40] },
      headStyles: { fillColor: [23, 88, 97], textColor: 255 },
      columnStyles: { 2: { halign: 'right' } },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  }

  // Total
  y += 24;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(16, 24, 40);
  doc.text(`Total pagado: ${formatoMoneda(pago.montoPagado, pago.moneda)}`, ancho - margen, y, {
    align: 'right',
  });
  if (pago.observaciones) {
    y += 22;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Observaciones: ${pago.observaciones}`, margen, y, { maxWidth: ancho - margen * 2 });
  }

  // Firmas
  const yFirma = Math.max(y + 70, alto - 120);
  doc.setDrawColor(152, 162, 179);
  doc.line(margen, yFirma, margen + 190, yFirma);
  doc.line(ancho - margen - 190, yFirma, ancho - margen, yFirma);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(102, 112, 133);
  doc.text('Firma y aclaración — Responsable del pago', margen, yFirma + 12);
  doc.text('Firma y aclaración — Recibí conforme', ancho - margen - 190, yFirma + 12);

  doc.save(`orden-de-pago-${pago.codigo}.pdf`);
}
