// Clasificación de los rechazos de Payway.
//
// En `payway_cobros.error_mensaje` se guarda lo que devuelve
// `lib/payway/format-error.ts`, que prioriza: la descripción humana que manda la
// tarjeta ("TARJETA VENCIDA", "SIN FONDOS SUFICIENTES"), después el tipo de
// error de Payway ("invalid_card", "insufficient_amount"), después el código de
// razón, y como último recurso el status crudo.
//
// A diferencia de los rechazos de ARCA, acá la causa casi nunca son datos
// nuestros: es la tarjeta o el banco. Lo que el club necesita saber es si
// reintentar sirve de algo o si hay que avisarle al socio.
//
// OJO: estos patrones están hechos sobre los mensajes DOCUMENTADOS del
// acquirer, no sobre rechazos observados (todavía no hubo ninguno en prod). La
// causa desconocida muestra el texto crudo, así que un mensaje que no matchee
// igual se ve — si aparece uno nuevo, agregarlo acá.

export type CausaRechazoPayway = {
  id: string;
  titulo: string;
  queHacer: string;
  /** true si volver a intentar el mismo cobro puede salir bien sin que cambie nada. */
  reintentarSirve: boolean;
};

const CAUSAS: Array<{ test: RegExp; causa: CausaRechazoPayway }> = [
  {
    // Valores de descarte de formatPaywayError: llegan cuando Payway no manda
    // ni descripción ni tipo. Anclados, para no comerse mensajes que contienen
    // la palabra (ej. "TARJETA RECHAZADA, LLAME").
    test: /^(rejected|rechazado|rechazada)$/i,
    causa: {
      id: 'sin-detalle',
      titulo: 'Rechazado sin detalle',
      queHacer:
        'Payway informó el rechazo pero no dijo por qué. Reintentar puede devolver un motivo más claro; si se repite, que el socio consulte con su banco.',
      reintentarSirve: true,
    },
  },
  {
    test: /sin fondos|fondos insuficientes|insufficient_amount|insufficient/i,
    causa: {
      id: 'sin-fondos',
      titulo: 'Sin fondos suficientes',
      queHacer:
        'Reintentar más adelante puede funcionar: depende de que el socio tenga saldo o límite disponible.',
      reintentarSirve: true,
    },
  },
  {
    test: /vencida|expirada|invalid_expiration_date|expired/i,
    causa: {
      id: 'tarjeta-vencida',
      titulo: 'Tarjeta vencida',
      queHacer:
        'Reintentar no sirve. El socio tiene que cargar la tarjeta nueva desde la app; hasta que lo haga, va a rechazar siempre.',
      reintentarSirve: false,
    },
  },
  {
    test: /invalid_security_code|codigo de seguridad|cvv|cvc/i,
    causa: {
      id: 'codigo-seguridad',
      titulo: 'Código de seguridad inválido',
      queHacer: 'Reintentar no sirve. El socio tiene que volver a cargar la tarjeta desde la app.',
      reintentarSirve: false,
    },
  },
  {
    test: /tarjeta invalida|invalid_card|tarjeta no valida|numero de tarjeta/i,
    causa: {
      id: 'tarjeta-invalida',
      titulo: 'Tarjeta inválida',
      queHacer: 'Reintentar no sirve. El socio tiene que volver a cargar la tarjeta desde la app.',
      reintentarSirve: false,
    },
  },
  {
    test: /retenida|robada|perdida|blacklisted|denunciada/i,
    causa: {
      id: 'tarjeta-bloqueada',
      titulo: 'Tarjeta bloqueada, retenida o denunciada',
      queHacer:
        'Reintentar no sirve. El socio tiene que resolverlo con su banco y cargar otra tarjeta.',
      reintentarSirve: false,
    },
  },
  {
    test: /llame|call|no honrar|denegada|do_not_honor|rechazada por el emisor/i,
    causa: {
      id: 'emisor-rechaza',
      titulo: 'El banco emisor rechazó el pago',
      queHacer:
        'El motivo lo tiene el banco, no nosotros. Conviene que el socio llame a su emisor; reintentar a veces funciona pero no siempre.',
      reintentarSirve: true,
    },
  },
  {
    test: /no permitida|not_permitted|transaccion invalida|invalid_transaction/i,
    causa: {
      id: 'operacion-no-permitida',
      titulo: 'Operación no permitida para esa tarjeta',
      queHacer:
        'La tarjeta no admite débitos automáticos o compras recurrentes. El socio tiene que usar otra.',
      reintentarSirve: false,
    },
  },
  {
    test: /limite|excede|exceeds/i,
    causa: {
      id: 'limite-excedido',
      titulo: 'Supera el límite de la tarjeta',
      queHacer: 'Reintentar más adelante puede funcionar, o cobrar con otro medio.',
      reintentarSirve: true,
    },
  },
  {
    test: /credenciales|unauthorized|401|autenticacion|authentication/i,
    causa: {
      id: 'credenciales',
      titulo: 'Problema de credenciales con Payway',
      queHacer:
        'No es la tarjeta del socio: son las credenciales del club. Revisar la configuración de Payway en Mi perfil antes de reintentar.',
      reintentarSirve: false,
    },
  },
];

/**
 * Clasifica un motivo de rechazo de Payway. Si no lo reconoce, devuelve una
 * causa genérica con el texto original — así un mensaje nuevo no queda oculto.
 */
export function clasificarRechazoPayway(motivo: string | null): CausaRechazoPayway {
  const texto = (motivo ?? '').trim();
  if (!texto) {
    return {
      id: 'sin-motivo',
      titulo: 'Rechazado sin motivo registrado',
      queHacer: 'Payway no devolvió un motivo. Reintentar para ver si informa algo.',
      reintentarSirve: true,
    };
  }
  for (const { test, causa } of CAUSAS) {
    if (test.test(texto)) return causa;
  }
  return {
    id: 'otro',
    titulo: 'Otro motivo',
    queHacer: texto,
    reintentarSirve: true,
  };
}
