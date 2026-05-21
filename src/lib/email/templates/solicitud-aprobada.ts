// Template del mail que recibe el solicitante cuando el admin del club aprueba
// su pedido de membresía. Mismo estilo (tablas + inline styles + paleta
// #175861) que los templates de Supabase Auth en `email-templates/` para
// máxima compatibilidad con clientes y consistencia de marca.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function solicitudAprobadaEmail(params: {
  nombreSolicitante: string | null;
  nombreClub: string;
}): { subject: string; html: string } {
  const nombre = params.nombreSolicitante?.trim();
  const saludo = nombre ? `Hola ${escapeHtml(nombre)},` : 'Hola,';
  const club = escapeHtml(params.nombreClub);

  const subject = `Te aprobaron en ${params.nombreClub}`;

  const html = `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>${subject}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#F2F4F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#101828;">
    <div style="display:none;font-size:1px;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;color:#F2F4F7;">Tu solicitud para sumarte a ${club} fue aprobada.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F2F4F7;padding:48px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;margin:0 auto 24px auto;">
            <tr>
              <td align="center" style="padding:0;">
                <img src="https://nauticapp.club/logo-nauticapp.png" alt="NauticApp" width="140" height="49" style="display:block;border:0;outline:none;text-decoration:none;height:auto;width:140px;max-width:140px;" />
              </td>
            </tr>
          </table>
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background-color:#ffffff;border-radius:16px;border:1px solid #E4E7EC;overflow:hidden;">
            <tr>
              <td style="height:4px;background-color:#175861;line-height:4px;font-size:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:40px 40px 8px 40px;">
                <h1 style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-weight:700;font-size:24px;line-height:1.3;color:#101828;letter-spacing:-0.01em;">Te aprobaron en ${club}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:0 40px 24px 40px;">
                <p style="margin:0;font-size:15px;line-height:1.65;color:#475467;">${saludo} tu solicitud para sumarte a <strong style="color:#101828;">${club}</strong> fue aprobada. Ya podés ingresar a la app de NauticApp y empezar a usar el club.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 40px 32px 40px;">
                <p style="margin:0;font-size:13px;line-height:1.6;color:#98A2B3;">Si no esperabas este mail, ignoralo. No se hará ningún cambio en tu cuenta.</p>
              </td>
            </tr>
          </table>
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;margin:32px auto 0 auto;">
            <tr>
              <td align="center" style="padding:0 16px;">
                <p style="margin:0 0 4px 0;font-size:12px;color:#667085;">¿Necesitás ayuda? <a href="mailto:soporte@nauticapp.club" style="color:#175861;text-decoration:none;">soporte@nauticapp.club</a></p>
                <p style="margin:0;font-size:12px;color:#98A2B3;">&copy; NauticApp &middot; Sistema de gestión náutica &middot; <a href="https://nauticapp.club" style="color:#98A2B3;text-decoration:none;">nauticapp.club</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html };
}
