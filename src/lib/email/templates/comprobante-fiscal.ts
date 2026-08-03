// Template del mail que reenvía un comprobante fiscal (factura / NC / ND de
// ARCA) al socio, con el PDF adjunto. Mismo estilo (tablas + inline styles)
// que recibo.ts para compatibilidad de clientes de mail.

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export type ComprobanteFiscalEmailParams = {
  clubNombre: string;
  clubCuit: string | null;
  clubDireccion: string | null;
  clubLogoUrl: string | null;
  tipoLabel: string; // ej. "Factura A"
  numero: string; // comprobante_nro ARCA, ej. "00003-00000012"
  fecha: string; // ya formateada DD/MM/YYYY
  socioNombre: string;
  importeFmt: string; // ya formateado $X
  // true si el PDF va adjunto al mail; false = no se pudo adjuntar y el mail
  // avisa que lo pidan al club.
  conAdjunto: boolean;
};

export function comprobanteFiscalEmail(p: ComprobanteFiscalEmailParams): {
  subject: string;
  html: string;
} {
  const subject = `${p.tipoLabel} ${p.numero} — ${p.clubNombre}`;

  const logo = p.clubLogoUrl
    ? `<img src="${esc(p.clubLogoUrl)}" alt="${esc(p.clubNombre)}" width="56" height="56" style="display:block;border:0;border-radius:6px;object-fit:contain;" />`
    : '';

  const filas = [
    ['Comprobante', `${esc(p.tipoLabel)} ${esc(p.numero)}`],
    ['Fecha de emisión', esc(p.fecha)],
    ['Total', `<strong>${esc(p.importeFmt)}</strong>`],
  ]
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 0;color:#667085;font-size:14px;width:150px;vertical-align:top;">${k}:</td><td style="padding:6px 0;color:#101828;font-size:14px;">${v}</td></tr>`,
    )
    .join('');

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
          </tr></table>
        </td></tr>
        <tr><td style="padding:8px 32px 0 32px;"><div style="border-top:1px solid #E4E7EC;"></div></td></tr>
        <tr><td style="padding:16px 32px;">
          <p style="margin:0 0 12px 0;font-size:14px;color:#101828;">Hola ${esc(p.socioNombre)},</p>
          <p style="margin:0 0 12px 0;font-size:14px;color:#101828;">Te enviamos tu comprobante${p.conAdjunto ? ' — lo vas a encontrar adjunto en este mail en formato PDF.' : '.'}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${filas}</table>
          ${p.conAdjunto ? '' : '<p style="margin:12px 0 0 0;font-size:13px;color:#667085;">Si necesitás el PDF, pedíselo al club.</p>'}
        </td></tr>
        <tr><td style="padding:14px 32px;background-color:#F9FAFB;text-align:center;border-top:1px dashed #E4E7EC;">
          <p style="margin:0;font-size:12px;color:#98A2B3;">Comprobante emitido a través de ARCA · ${esc(p.clubNombre)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject, html };
}
