export type EstadoTarea = 'salida_programada' | 'preparar' | 'navegando' | 'guardada' | 'lavado';

export const ESTADOS_TAREA: EstadoTarea[] = [
  'salida_programada',
  'preparar',
  'navegando',
  'guardada',
  'lavado',
];

// Estados terminales: una vez la tarea entra acá, no se puede mover de estado.
// `guardada`: terminal del flujo operativo (regla de producto). `lavado`: tiene
// su propio sub-estado en `solicitudes_lavado` y no participa del flujo.
export const ESTADOS_TAREA_TERMINALES: EstadoTarea[] = ['guardada', 'lavado'];

export const ESTADOS_SOLICITUD_LAVADO = ['pendiente', 'aceptada', 'lista', 'cancelada'] as const;
export type EstadoSolicitudLavado = (typeof ESTADOS_SOLICITUD_LAVADO)[number];
