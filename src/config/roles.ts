export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMINISTRADOR_GENERAL: 'administrador_general',
  OPERARIO: 'operario',
  CONTABLE: 'contable',
  MANTENIMIENTO: 'mantenimiento',
  COMUNICACIONES: 'comunicaciones',
  RESTAURANTES: 'restaurantes',
  SOCIO: 'socio',
  INVITADO: 'invitado',
  PROVEEDOR: 'proveedor',
} as const;

export type Rol = (typeof ROLES)[keyof typeof ROLES];

export const ALL_ROLES: Rol[] = Object.values(ROLES);

// Roles con acceso administrativo a la guardería
export const ADMIN_ROLES: Rol[] = [ROLES.SUPER_ADMIN, ROLES.ADMINISTRADOR_GENERAL, ROLES.CONTABLE];

// Roles de staff operativo
export const STAFF_ROLES: Rol[] = [
  ROLES.OPERARIO,
  ROLES.MANTENIMIENTO,
  ROLES.COMUNICACIONES,
  ROLES.RESTAURANTES,
];
