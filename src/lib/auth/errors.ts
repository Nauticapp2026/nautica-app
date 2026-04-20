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
