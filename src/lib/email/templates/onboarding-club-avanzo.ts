// Mail INTERNO a NauticApp (no al club) cuando alguien avanza en el onboarding
// hasta el paso de "Configuración de espacios". Sirve para poder contactar al
// club si no llega a completar la reunión que agenda por Calendly más
// adelante en el wizard. Por eso no lleva el estilo de marca de los mails al
// cliente — es un aviso interno, plano.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function onboardingClubAvanzoEmail(params: {
  nombreClub: string;
  cuit: string | null;
  direccion: string | null;
  ciudad: string | null;
  adminNombre: string | null;
  adminApellido: string | null;
  adminEmail: string;
  adminTelefono: string | null;
}): { subject: string; html: string } {
  const club = escapeHtml(params.nombreClub);
  const adminNombreCompleto =
    [params.adminNombre, params.adminApellido].filter(Boolean).join(' ').trim() || '—';
  const ubicacion = [params.direccion, params.ciudad].filter(Boolean).join(', ') || '—';

  const subject = `Nuevo club en onboarding: ${params.nombreClub}`;

  const filas: [string, string][] = [
    ['Club', club],
    ['CUIT', escapeHtml(params.cuit ?? '—')],
    ['Dirección', escapeHtml(ubicacion)],
    ['Contacto', escapeHtml(adminNombreCompleto)],
    ['Email', escapeHtml(params.adminEmail)],
    ['Teléfono', escapeHtml(params.adminTelefono ?? '—')],
  ];

  const html = `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <title>${subject}</title>
  </head>
  <body style="margin:0;padding:24px;background-color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#101828;">
    <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;">
      Un club completó la configuración de espacios en el onboarding — todavía le falta agendar/cumplir la reunión de Calendly. Si no la completa, contactar con estos datos:
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="font-size:14px;border-collapse:collapse;">
      ${filas
        .map(
          ([label, value]) => `<tr>
        <td style="padding:4px 12px 4px 0;color:#667085;white-space:nowrap;">${label}</td>
        <td style="padding:4px 0;font-weight:600;color:#101828;">${value}</td>
      </tr>`,
        )
        .join('')}
    </table>
  </body>
</html>`;

  return { subject, html };
}
