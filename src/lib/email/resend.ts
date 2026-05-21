import { Resend } from 'resend';

// Cliente Resend para mails transaccionales fuera de Supabase Auth (los de
// Auth viajan por el SMTP custom configurado en el dashboard de Supabase).
// La key vive en la env var RESEND_API_KEY (cargada en Vercel en los 3 envs).

const apiKey = process.env.RESEND_API_KEY;
const resend = apiKey ? new Resend(apiKey) : null;

// Remitente fijo: el mismo dominio verificado que ya usa Supabase Auth, así
// la entregabilidad y el branding quedan consistentes.
const FROM = 'NauticApp <noreply@nauticapp.club>';

type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
};

export async function sendEmail(
  params: SendEmailParams,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!resend) {
    return {
      ok: false,
      error: 'RESEND_API_KEY no está configurada — el mail no se envía.',
    };
  }

  try {
    const result = await resend.emails.send({
      from: FROM,
      to: params.to,
      subject: params.subject,
      html: params.html,
    });
    if (result.error) {
      return { ok: false, error: result.error.message };
    }
    return { ok: true, id: result.data?.id ?? '' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
