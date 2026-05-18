export type EstadoTarea = 'salida_programada' | 'preparar' | 'navegando' | 'guardada' | 'lavado';

export const ESTADOS_TAREA: EstadoTarea[] = [
  'salida_programada',
  'preparar',
  'navegando',
  'guardada',
  'lavado',
];

export const ESTADOS_SOLICITUD_LAVADO = ['pendiente', 'aceptada', 'lista', 'cancelada'] as const;
export type EstadoSolicitudLavado = (typeof ESTADOS_SOLICITUD_LAVADO)[number];
