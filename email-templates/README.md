# Email templates — NauticApp

Templates HTML para los mails transaccionales que Supabase Auth dispara.
Diseñados para máxima compatibilidad (tables + inline styles) y branded
con los colores de NauticApp (#175861).

## Archivos

| Archivo                    | Supabase template    | Cuándo se dispara                                       |
| -------------------------- | -------------------- | ------------------------------------------------------- |
| `01-confirm-signup.html`   | Confirm signup       | Al registrarse con email/password (si email confirm on) |
| `02-invite-user.html`      | Invite user          | Al invitar un miembro del equipo (el más importante)    |
| `03-magic-link.html`       | Magic Link           | Login pasado por link                                   |
| `04-change-email.html`     | Change Email Address | Al cambiar de email                                     |
| `05-reset-password.html`   | Reset Password       | Al solicitar recuperar contraseña                       |
| `06-reauthentication.html` | Reauthentication     | Código OTP para reconfirmar identidad                   |

## Variables Supabase

Los templates usan variables que Supabase reemplaza al enviar:

- `{{ .ConfirmationURL }}` — URL con token que el usuario debe abrir
- `{{ .Token }}` — código OTP de 6 dígitos (solo en reauthentication)
- `{{ .Email }}` — email del destinatario
- `{{ .NewEmail }}` — email nuevo (solo en change-email)

## Cómo pegarlos en Supabase

1. Ir a Supabase Dashboard → Authentication → Email Templates.
2. Por cada template, abrir el HTML del archivo correspondiente, copiar
   todo el contenido y pegarlo en el editor.
3. Ajustar también el "Subject" (sugerencias):
   - Confirm signup: `Confirmá tu email — NauticApp`
   - Invite user: `Te sumaron a NauticApp`
   - Magic Link: `Tu link de acceso a NauticApp`
   - Change Email: `Confirmá tu nuevo email`
   - Reset Password: `Restablecé tu contraseña`
   - Reauthentication: `Tu código de verificación`
4. Guardar.

## Configurar SMTP custom (para que no salgan desde supabase.io)

El remitente va a ser `noreply@nauticapp.club`. Pasos:

### 1. Crear cuenta en Resend

1. Ir a https://resend.com y registrarse.
2. En el dashboard, Domains → Add Domain → `nauticapp.club`.
3. Resend muestra 3–4 registros DNS (SPF, DKIM, a veces DMARC).
4. Cargarlos en el DNS del dominio (GoDaddy → DNS Management). Esperar
   5–30 min a que se verifiquen.
5. Apenas el dominio queda "Verified", crear una API Key en API Keys →
   Create API Key → permiso "Sending access".

### 2. Configurar SMTP en Supabase

Dashboard → Project Settings → Authentication → SMTP Settings → Enable
custom SMTP. Datos:

- Sender email: `noreply@nauticapp.club`
- Sender name: `NauticApp`
- Host: `smtp.resend.com`
- Port: `465`
- Username: `resend`
- Password: la API key que generaste

Guardar. Mandá un test (por ejemplo desde Authentication → Users → invitar
a un email de prueba) y verificá que el mail llega con remitente
`NauticApp <noreply@nauticapp.club>`.

### 3. (Opcional pero recomendado) DMARC

Una vez que SPF y DKIM están OK, agregar un registro TXT DMARC en
`_dmarc.nauticapp.club`:
`v=DMARC1; p=quarantine; rua=mailto:dmarc@nauticapp.club`

Mejora la entregabilidad y evita que otros suplanten el dominio.
