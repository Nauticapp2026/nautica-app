// Template del mail masivo que el club manda a los socios de un área de
// espacios. El asunto y el cuerpo los escribe el club; acá solo se envuelven en
// el marco de marca. Mismo estilo (tablas + inline styles + paleta #175861) que
// el resto de los templates, para compatibilidad con clientes de mail.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Convierte el texto plano que escribió el club en párrafos HTML. Se escapa
 * TODO antes de armar el HTML: el cuerpo es texto libre de un usuario y no
 * puede inyectar markup en el mail de otro.
 */
function textoAParrafos(texto: string): string {
  return texto
    .split(/\n{2,}/)
    .map((bloque) => bloque.trim())
    .filter(Boolean)
    .map(
      (bloque) =>
        `<p style="margin:0 0 16px 0;font-size:15px;line-height:24px;color:#344054;">${escapeHtml(
          bloque,
        ).replace(/\n/g, '<br />')}</p>`,
    )
    .join('');
}

export function avisoClubEmail(params: {
  nombreSocio: string | null;
  nombreClub: string;
  asunto: string;
  cuerpo: string;
}): { subject: string; html: string } {
  const nombre = params.nombreSocio?.trim();
  const saludo = nombre ? `Hola ${escapeHtml(nombre)},` : 'Hola,';
  const club = escapeHtml(params.nombreClub);
  const subject = params.asunto;
  const cuerpoHtml = textoAParrafos(params.cuerpo);

  const html = `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#F2F4F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#101828;">
    <div style="display:none;font-size:1px;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;color:#F2F4F7;">${escapeHtml(subject)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F2F4F7;padding:48px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;margin:0 auto 24px auto;">
            <tr>
              <td align="center" style="padding:0;">
                <img src="https://www.nauticapp.club/logo-nauticapp.png" alt="NauticApp" width="140" height="49" style="display:block;border:0;outline:none;text-decoration:none;height:auto;width:140px;max-width:140px;" />
              </td>
            </tr>
          </table>
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background-color:#ffffff;border-radius:16px;border:1px solid #E4E7EC;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 8px 32px;">
                <p style="margin:0 0 4px 0;font-size:13px;font-weight:600;color:#175861;text-transform:uppercase;letter-spacing:0.04em;">${club}</p>
                <h1 style="margin:0 0 20px 0;font-size:20px;line-height:28px;font-weight:700;color:#101828;">${escapeHtml(subject)}</h1>
                <p style="margin:0 0 16px 0;font-size:15px;line-height:24px;color:#344054;">${saludo}</p>
                ${cuerpoHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 32px 32px;">
                <p style="margin:0;font-size:13px;line-height:20px;color:#667085;">
                  Este mensaje lo envió <strong style="color:#344054;">${club}</strong> a través de NauticApp.
                </p>
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
