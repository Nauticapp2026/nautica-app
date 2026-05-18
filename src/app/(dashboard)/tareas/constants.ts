export type EstadoTarea = 'salida_programada' | 'preparar' | 'navegando' | 'guardada' | 'lavado';

export const ESTADOS_TAREA: EstadoTarea[] = [
  'salida_programada',
  'preparar',
  'navegando',
  'guardada',
  'lavado',
];

// 'en_proceso' queda en el enum por compatibilidad con la app mobile mientras
// se deploya; el código del web solo emite 'aceptada' a partir de ahora.
export const ESTADOS_SOLICITUD_LAVADO = ['pendiente', 'aceptada', 'lista', 'cancelada'] as const;
export type EstadoSolicitudLavado = (typeof ESTADOS_SOLICITUD_LAVADO)[number] | 'en_proceso';
