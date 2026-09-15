// Template del mail "Estado de cuenta" que el club le manda al socio, con el
// PDF adjunto. Mismo estilo (tablas + inline styles) que recibo.ts para
// compatibilidad de clientes de correo.

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export type EstadoCuentaEmailParams = {
  clubNombre: string;
  socioNombre: string;
  fecha: string; // ya formateada DD/MM/YYYY
  /** "Saldo deudor" / "Saldo a favor" / "Saldo" */
  saldoLabel: string;
  /** Ya formateado, con signo si corresponde. */
  saldoFmt: string;
  /** Texto libre que escribió el admin (opcional). Se muestra tal cual, escapado. */
  mensaje?: string | null;
  movimientos: number;
};

export function estadoCuentaEmail(p: EstadoCuentaEmailParams): { subject: string; html: string } {
  const subject = `Estado de cuenta — ${p.clubNombre}`;

  const mensaje = p.mensaje?.trim()
    ? `<tr><td style="padding:0 32px 20px 32px;">
          <div style="padding:14px 16px;background-color:#F9FAFB;border-left:3px solid #175861;border-radius:6px;font-size:14px;line-height:1.55;color:#344054;white-space:pre-wrap;">${esc(p.mensaje.trim())}</div>
        </td></tr>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background-color:#F2F4F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#101828;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F2F4F7;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background-color:#ffffff;border-radius:16px;border:1px solid #E4E7EC;overflow:hidden;">
        <tr><td style="padding:28px 32px 8px 32px;">
          <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:1px;color:#175861;text-transform:uppercase;">${esc(p.clubNombre)}</p>
          <h1 style="margin:6px 0 0 0;font-size:22px;font-weight:800;color:#101828;">Estado de cuenta</h1>
          <p style="margin:6px 0 0 0;font-size:14px;color:#667085;">Hola ${esc(p.socioNombre)}, te enviamos el detalle de tu cuenta corriente al ${esc(p.fecha)}. El documento completo va adjunto en PDF.</p>
        </td></tr>
        ${mensaje}
        <tr><td style="padding:0 32px 8px 32px;"><div style="border-top:1px solid #E4E7EC;"></div></td></tr>
        <tr><td style="padding:8px 32px 24px 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="padding:6px 0;color:#667085;font-size:14px;">Movimientos incluidos</td>
              <td style="padding:6px 0;color:#101828;font-size:14px;text-align:right;">${p.movimientos}</td>
            </tr>
            <tr>
              <td style="padding:10px 0 0 0;color:#101828;font-size:15px;font-weight:700;">${esc(p.saldoLabel)}</td>
              <td style="padding:10px 0 0 0;color:#101828;font-size:22px;font-weight:800;text-align:right;">${esc(p.saldoFmt)}</td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:14px 32px;background-color:#F9FAFB;text-align:center;border-top:1px dashed #E4E7EC;">
          <p style="margin:0;font-size:12px;color:#98A2B3;">Ante cualquier consulta, respondé este mail o comunicate con ${esc(p.clubNombre)}.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject, html };
}
