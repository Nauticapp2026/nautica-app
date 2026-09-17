/**
 * Datos de contacto públicos de NauticApp (los que ve cualquiera que entra a
 * la web). Viven acá para que el footer, el botón flotante de WhatsApp y lo
 * que venga después no se desincronicen.
 *
 * Distinto del soporte del panel: ese usa `NEXT_PUBLIC_SOPORTE_TEL` y es para
 * los clubes que ya son clientes (ver `SoporteButton` en el sidebar).
 */

/** Número de WhatsApp, tal como se muestra a una persona. */
export const WHATSAPP_VISIBLE = '+54 9 11 3006-7890';

/** El mismo número como lo pide wa.me: solo dígitos, con código de país. */
export const WHATSAPP_NUMERO = '5491130067890';

export const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMERO}`;

export const EMAIL_CONTACTO = 'hola@nauticapp.club';

export const EMAIL_CONTACTO_URL = `mailto:${EMAIL_CONTACTO}`;
