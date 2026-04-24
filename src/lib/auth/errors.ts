const ERROR_MAP: Record<string, string> = {
  'Invalid login credentials': 'Email o contraseña incorrectos',
  'Email not confirmed': 'Tu email aún no fue confirmado. Revisá tu bandeja de entrada',
  'User already registered': 'Ya existe una cuenta con ese email',
  'Password should be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres',
  'Unable to validate email address: invalid format': 'El formato del email es inválido',
  'For security purposes, you can only request this after 60 seconds':
    'Por seguridad, esperá 60 segundos antes de intentarlo de nuevo',
  'Email rate limit exceeded': 'Demasiados intentos. Intentá más tarde',
  'Too many requests': 'Demasiadas solicitudes. Intentá más tarde',
  signup_disabled: 'El registro no está disponible en este momento',
  email_not_confirmed: 'Tu email aún no fue confirmado. Revisá tu bandeja de entrada',
  invalid_credentials: 'Email o contraseña incorrectos',
};

export function translateAuthError(message: string): string {
  return ERROR_MAP[message] ?? 'Ocurrió un error inesperado. Intentá de nuevo';
}

// Traduce errores típicos de admin.auth.admin.inviteUserByEmail.
// Se usa en tres lugares: alta de miembro del equipo (configuración),
// alta de socio (usuarios) e invitación en onboarding. Incluye fallback
// con el mensaje original para diagnosticar problemas de SMTP/rate limit
// sin tener que leer los logs del servidor.
export function translateInviteError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('already been registered') || m.includes('already exists')) {
    return 'Ya existe una cuenta con ese email.';
  }
  if (m.includes('invalid format') || m.includes('unable to validate email')) {
    return 'El formato del email es inválido.';
  }
  if (m.includes('rate limit') || m.includes('too many requests')) {
    return 'Límite de envío de emails alcanzado. Esperá unos minutos o configurá un SMTP propio en Supabase.';
  }
  if (m.includes('smtp') || m.includes('sending') || m.includes('sender') || m.includes('mail')) {
    return `No se pudo enviar el email de invitación. Detalle: ${message}`;
  }
  // Fallback: devolvemos el mensaje crudo para poder diagnosticar.
  return `No se pudo crear la cuenta. Detalle: ${message}`;
}
