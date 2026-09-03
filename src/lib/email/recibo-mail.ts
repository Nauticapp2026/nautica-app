/**
 * Armado y envío del mail del recibo al socio.
 *
 * Vive acá y no en `actions/facturacion.ts` porque lo necesitan dos llamadores
 * con contextos distintos: el botón de la UI (que tiene sesión de admin) y el
 * cron del débito automático (que no tiene ninguna). Un archivo `'use server'`
 * no puede exportarla sin convertirla en server action, y una server action que
 * recibe `guarderiaId` por parámetro sería un agujero de multi-tenancy: un
 * cliente podría pedirle mandar recibos de otro club. Acá el scope lo pone el
 * llamador, que ya lo verificó.
 */

import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { facturacion, guarderias, profiles } from '@/lib/db/schema';
import { sendEmail } from '@/lib/email/resend';
import { esCodigoReciboCobranza } from '@/lib/recibo-codigos';
import { reciboEmail } from '@/lib/email/templates/recibo';
import {
  getComprobantesCobrados,
  getComprobantesCobradosLegacy,
  getDatosPagoRecibo,
  type AplicacionRecibo,
  type ComprobanteCobrado,
} from '@/lib/recibo-desglose';
import { FORMA_PAGO_LABEL } from '@/lib/tusfacturas/mappers';

export const TIPO_COMPROBANTE_LABEL_MAIL: Record<string, string> = {
  factura_a: 'Factura A',
  factura_b: 'Factura B',
  factura_c: 'Factura C',
  nota_credito_a: 'Nota de crédito A',
  nota_credito_b: 'Nota de crédito B',
  nota_credito_c: 'Nota de crédito C',
  nota_debito_a: 'Nota de débito A',
  nota_debito_b: 'Nota de débito B',
  nota_debito_c: 'Nota de débito C',
};

/**
 * Manda el recibo `reciboId` al mail del socio. `gId` acota la búsqueda a la
 * guardería: el llamador es responsable de que sea la correcta.
 */
export async function enviarReciboPorMail(
  reciboId: string,
  gId: string,
): Promise<{ error?: string; email?: string }> {
  const [row] = await db
    .select({
      id: facturacion.id,
      codigo: facturacion.codigo,
      tipoFactura: facturacion.tipoFactura,
      importe: facturacion.importe,
      descripcion: facturacion.descripcion,
      medioPago: facturacion.medioPago,
      emision: facturacion.emision,
      socioId: facturacion.socioId,
      movimientoId: facturacion.movimientoId,
      cobranzaComprobanteIds: facturacion.cobranzaComprobanteIds,
      socioNombre: profiles.nombre,
      socioApellido: profiles.apellido,
      socioCuit: profiles.cuit,
      socioDocumento: profiles.numeroDocumento,
      socioEmail: profiles.email,
      socioEmailFacturacion: profiles.emailFacturacion,
      guarderiaName: guarderias.nombre,
      guarderiaRazonSocial: guarderias.razonSocial,
      guarderiaDireccion: guarderias.direccion,
      guarderiaCuit: guarderias.cuit,
      guarderiaLogo: guarderias.logoUrl,
    })
    .from(facturacion)
    .leftJoin(profiles, eq(profiles.id, facturacion.socioId))
    .innerJoin(guarderias, eq(guarderias.id, facturacion.guarderiaId))
    .where(and(eq(facturacion.id, reciboId), eq(facturacion.guarderiaId, gId)))
    .limit(1);

  if (!row || row.tipoFactura !== 'recibo') return { error: 'Recibo no encontrado.' };

  const destino = row.socioEmailFacturacion?.trim() || row.socioEmail;
  if (!destino) return { error: 'El socio no tiene email cargado.' };

  // Comprobantes que cobró el recibo — igual que la vista del recibo: los
  // exactos guardados en cobranza_comprobante_ids (con el detalle de sus
  // cargos), o la heurística FIFO para recibos viejos sin ese dato. Solo
  // aplica a recibos de cobranza (RC-/RI-): RB-/CM-/CL- documentan un cargo
  // propio, no un pago — para esos se usa row.descripcion más abajo.
  const fmtPesos = (v: string | null) =>
    `$${parseFloat(v ?? '0').toLocaleString('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  const esReciboCobranza = esCodigoReciboCobranza(row.codigo);

  // Aplicaciones targeted del pago (recibos nuevos): cuánto fue a cada
  // comprobante — en un pago parcial el mail muestra lo aplicado, no el total.
  let aplicaciones: AplicacionRecibo[] | null = null;
  if (esReciboCobranza && row.movimientoId) {
    aplicaciones = (await getDatosPagoRecibo(row.movimientoId)).aplicaciones;
  }

  // Mismo desglose que la página imprimible del recibo (ver
  // src/lib/recibo-desglose.ts): el mail y el papel tienen que decir lo mismo.
  const comprobantes: string[] = [];
  if (row.socioId && esReciboCobranza) {
    let cobrados: ComprobanteCobrado[] = [];
    if (row.cobranzaComprobanteIds && row.cobranzaComprobanteIds.length > 0) {
      cobrados = await getComprobantesCobrados(gId, row.cobranzaComprobanteIds, aplicaciones);
    } else if (aplicaciones == null) {
      // Recibo viejo sin aplicaciones guardadas: un recibo nuevo sin
      // comprobantes es un adelanto.
      cobrados = await getComprobantesCobradosLegacy(gId, row.socioId, row.importe);
    }

    const labelDe = (t: string | null) =>
      t === 'recibo' ? 'Comprobante interno' : (TIPO_COMPROBANTE_LABEL_MAIL[t ?? ''] ?? t ?? '');
    for (const c of cobrados) {
      // En un pago parcial se informa lo que aplicó ESTE recibo; en recibos
      // viejos (sin aplicaciones guardadas) solo se conoce el total.
      comprobantes.push(
        `${labelDe(c.tipoFactura)} ${c.codigo ?? ''} — ${fmtPesos(c.montoAplicado ?? c.importe)}${
          c.parcial ? ` (pago parcial — total ${fmtPesos(c.importe)})` : ''
        }`.trim(),
      );
      for (const d of c.detalle) {
        comprobantes.push(
          `· ${d.concepto ?? 'Servicio'}${d.importe != null ? ` — ${fmtPesos(d.importe)}` : ''}`,
        );
      }
    }
  }
  if (comprobantes.length === 0 && row.descripcion) comprobantes.push(row.descripcion);

  const socioNombre =
    [row.socioNombre, row.socioApellido].filter(Boolean).join(' ').trim() || 'Socio';
  const doc = row.socioCuit
    ? `CUIT: ${row.socioCuit}`
    : row.socioDocumento
      ? `DNI: ${row.socioDocumento}`
      : '';
  const importeFmt = `$${parseFloat(row.importe ?? '0').toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
  const fecha = (row.emision ?? new Date()).toLocaleDateString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const { subject, html } = reciboEmail({
    clubNombre: row.guarderiaRazonSocial ?? row.guarderiaName,
    clubCuit: row.guarderiaCuit,
    clubDireccion: row.guarderiaDireccion,
    clubLogoUrl: row.guarderiaLogo,
    numero: row.codigo ?? '',
    fecha,
    recibiDe: doc ? `${socioNombre} — ${doc}` : socioNombre,
    importeFmt,
    comprobantes,
    formaPago: row.medioPago ? (FORMA_PAGO_LABEL[row.medioPago] ?? row.medioPago) : null,
    // "Recibo" solo para Cobranzas (RC-/RI-); CM-/CL-/RB- son Comprobante interno.
    esComprobanteInterno: !esReciboCobranza,
  });

  const res = await sendEmail({ to: destino, subject, html });
  if (!res.ok) return { error: 'No se pudo enviar el mail. Intentá de nuevo.' };
  return { email: destino };
}
