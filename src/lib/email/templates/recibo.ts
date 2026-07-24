// Template del recibo interno que se envía por mail al socio. Mismo estilo
// (tablas + inline styles) que solicitud-aprobada para compatibilidad de clientes.

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export type ReciboEmailParams = {
  clubNombre: string;
  clubCuit: string | null;
  clubDireccion: string | null;
  clubLogoUrl: string | null;
  numero: string;
  fecha: string; // ya formateada DD/MM/YYYY
  recibiDe: string; // nombre (+ doc)
  importeFmt: string; // ya formateado $X
  comprobantes: string[]; // ej. ["Factura B 0001-00000012"]
  formaPago: string | null;
  // true para CM-/CL-/RB- (documentan cargos, no un pago): el documento se
  // titula "Comprobante interno" — "Recibo" queda reservado para Cobranzas (RC-).
  esComprobanteInterno?: boolean;
};

export function reciboEmail(p: ReciboEmailParams): { subject: string; html: string } {
  const tituloDoc = p.esComprobanteInterno ? 'Comprobante interno' : 'Recibo';
  const subject = `${tituloDoc} ${p.numero} — ${p.clubNombre}`;

  const concepto =
    p.comprobantes.length > 0 ? p.comprobantes.map((c) => esc(c)).join('<br/>') : 'Pago a cuenta';

  const filas = [
    [p.esComprobanteInterno ? 'Socio' : 'Recibí de', esc(p.recibiDe)],
    [
      p.esComprobanteInterno ? 'Por un importe de' : 'La suma de',
      `<strong>${esc(p.importeFmt)}</strong>`,
    ],
    ['En concepto de', concepto],
    ...(p.formaPago ? [['Forma de pago', esc(p.formaPago)]] : []),
  ]
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 0;color:#667085;font-size:14px;width:130px;vertical-align:top;">${k}:</td><td style="padding:6px 0;color:#101828;font-size:14px;">${v}</td></tr>`,
    )
    .join('');

  const logo = p.clubLogoUrl
    ? `<img src="${esc(p.clubLogoUrl)}" alt="${esc(p.clubNombre)}" width="56" height="56" style="display:block;border:0;border-radius:6px;object-fit:contain;" />`
    : '';

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background-color:#F2F4F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#101828;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F2F4F7;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background-color:#ffffff;border-radius:16px;border:1px solid #E4E7EC;overflow:hidden;">
        <tr><td style="padding:28px 32px 8px 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="vertical-align:top;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                ${logo ? `<td style="padding-right:12px;vertical-align:top;">${logo}</td>` : ''}
                <td style="vertical-align:top;">
                  <p style="margin:0;font-size:17px;font-weight:700;color:#101828;">${esc(p.clubNombre)}</p>
                  ${p.clubDireccion ? `<p style="margin:2px 0 0 0;font-size:13px;color:#667085;">${esc(p.clubDireccion)}</p>` : ''}
                  ${p.clubCuit ? `<p style="margin:0;font-size:13px;color:#667085;">CUIT: ${esc(p.clubCuit)}</p>` : ''}
                </td>
              </tr></table>
            </td>
            <td style="text-align:right;vertical-align:top;">
              <p style="margin:0;font-size:20px;font-weight:800;letter-spacing:1px;color:#101828;">${tituloDoc.toUpperCase()}</p>
              <p style="margin:4px 0 0 0;font-size:13px;color:#667085;">Nro: ${esc(p.numero)}</p>
              <p style="margin:0;font-size:13px;color:#667085;">Fecha: ${esc(p.fecha)}</p>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:8px 32px 0 32px;"><div style="border-top:1px solid #E4E7EC;"></div></td></tr>
        <tr><td style="padding:16px 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${filas}</table>
        </td></tr>
        <tr><td style="padding:0 32px 8px 32px;"><div style="border-top:1px solid #E4E7EC;"></div></td></tr>
        <tr><td style="padding:8px 32px 24px 32px;text-align:right;">
          <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:1px;color:#98A2B3;text-transform:uppercase;">Total</p>
          <p style="margin:2px 0 0 0;font-size:22px;font-weight:800;color:#101828;">${esc(p.importeFmt)}</p>
        </td></tr>
        <tr><td style="padding:14px 32px;background-color:#F9FAFB;text-align:center;border-top:1px dashed #E4E7EC;">
          <p style="margin:0;font-size:12px;color:#98A2B3;">Este documento no tiene valor fiscal · Comprobante interno</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject, html };
}
