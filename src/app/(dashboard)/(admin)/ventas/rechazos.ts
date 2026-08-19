// Clasificación de los rechazos de ARCA / TusFacturas.
//
// Los motivos vienen como texto libre y traen datos variables adentro (el CUIT,
// una fecha), así que agrupar por el string crudo no agrupa nada: dos rechazos
// por la misma causa con socios distintos se ven como causas distintas. Acá se
// reconocen las causas conocidas y se les pone un título estable más una pista
// de qué hay que hacer, que es lo que el club realmente necesita saber.
//
// Módulo plano (sin 'use client' ni 'use server'): lo usa la UI de Ventas y
// puede usarlo el server si algún día se agrupa del lado del servidor.

export type CausaRechazo = {
  /** Clave de agrupación. */
  id: string;
  /** Qué pasó, en castellano. */
  titulo: string;
  /** Qué hay que hacer para que el reenvío funcione. */
  queHacer: string;
  /** true si se arregla editando datos del socio en la app. */
  editableEnLaApp: boolean;
};

const DESCONOCIDA_ID = 'otro';

// El orden importa: se devuelve la primera que matchea. Las más específicas van
// primero.
const CAUSAS: Array<{ test: RegExp; causa: Omit<CausaRechazo, 'id'> & { id: string } }> = [
  {
    test: /ya existe un registro con el tipo\/nro de documento/i,
    causa: {
      id: 'documento-duplicado-tf',
      titulo: 'El CUIT ya está cargado en TusFacturas con otro código de cliente',
      queHacer:
        'No se arregla desde acá: hay que entrar al panel de TusFacturas y unificar el código interno de ese cliente. Reenviar sin hacerlo va a volver a fallar.',
      editableEnLaApp: false,
    },
  },
  {
    test: /no se permite realizar (este tipo de comprobante|comprobantes a)/i,
    causa: {
      id: 'pos-no-habilitado',
      titulo: 'El punto de venta no está habilitado para emitir este tipo de comprobante',
      queHacer:
        'Revisar en ARCA que el punto de venta esté registrado con la condición de IVA correcta (para emitir Factura A tiene que ser Responsable Inscripto).',
      editableEnLaApp: false,
    },
  },
  {
    test: /condici[oó]n de iva/i,
    causa: {
      id: 'condicion-iva',
      titulo: 'Problema con la condición de IVA',
      queHacer:
        'Revisar la condición de IVA del socio en sus datos impositivos y volver a enviarlo.',
      editableEnLaApp: true,
    },
  },
  {
    test: /(cuit|documento).*(inv[aá]lid|incorrect|no v[aá]lid)|no es un cuit/i,
    causa: {
      id: 'documento-invalido',
      titulo: 'El CUIT o documento del socio no es válido',
      queHacer: 'Corregir el número en los datos impositivos del socio y volver a enviarlo.',
      editableEnLaApp: true,
    },
  },
  {
    test: /raz[oó]n social/i,
    causa: {
      id: 'razon-social',
      titulo: 'Falta o está mal la razón social',
      queHacer: 'Completar la razón social en los datos impositivos del socio.',
      editableEnLaApp: true,
    },
  },
  {
    test: /domicilio/i,
    causa: {
      id: 'domicilio',
      titulo: 'Problema con el domicilio',
      queHacer: 'Completar el domicilio del socio (calle, número, ciudad y provincia).',
      editableEnLaApp: true,
    },
  },
];

/**
 * Clasifica un motivo de rechazo. Si no reconoce la causa, devuelve una genérica
 * con el texto original como pista — así un motivo nuevo no queda invisible.
 */
export function clasificarRechazo(motivo: string | null): CausaRechazo {
  const texto = (motivo ?? '').trim();
  if (!texto) {
    return {
      id: 'sin-motivo',
      titulo: 'Rechazado sin motivo registrado',
      queHacer: 'Reenviar para ver el motivo que devuelve ARCA.',
      editableEnLaApp: false,
    };
  }
  for (const { test, causa } of CAUSAS) {
    if (test.test(texto)) return causa;
  }
  return {
    id: DESCONOCIDA_ID,
    titulo: 'Otro motivo',
    queHacer: texto,
    editableEnLaApp: false,
  };
}
