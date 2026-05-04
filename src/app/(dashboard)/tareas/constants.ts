export type EstadoTarea = 'preparar' | 'navegando' | 'guardada' | 'lavado';

export const ESTADOS_TAREA: EstadoTarea[] = ['preparar', 'navegando', 'guardada', 'lavado'];

export const ESTADOS_SOLICITUD_LAVADO = ['pendiente', 'en_proceso', 'lista', 'cancelada'] as const;
export type EstadoSolicitudLavado = (typeof ESTADOS_SOLICITUD_LAVADO)[number];
