export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMINISTRADOR_GENERAL: 'administrador_general',
  ADMINISTRATIVO: 'administrativo',
  OPERARIO: 'operario',
  CONTABLE: 'contable',
  MANTENIMIENTO: 'mantenimiento',
  COMUNICACIONES: 'comunicaciones',
  RESTAURANTES: 'restaurantes',
  SEGURIDAD: 'seguridad',
  SOCIO: 'socio',
  INVITADO: 'invitado',
  PROVEEDOR: 'proveedor',
} as const;

export type Rol = (typeof ROLES)[keyof typeof ROLES];

export const ALL_ROLES: Rol[] = Object.values(ROLES);

// Roles con acceso administrativo a la guardería.
// administrativo tiene exactamente los mismos permisos que administrador_general.
export const ADMIN_ROLES: Rol[] = [
  ROLES.SUPER_ADMIN,
  ROLES.ADMINISTRADOR_GENERAL,
  ROLES.ADMINISTRATIVO,
  ROLES.CONTABLE,
];

// Roles de staff operativo
export const STAFF_ROLES: Rol[] = [
  ROLES.OPERARIO,
  ROLES.MANTENIMIENTO,
  ROLES.COMUNICACIONES,
  ROLES.RESTAURANTES,
  ROLES.SEGURIDAD,
];

// Roles asignables como membership en una guardería desde el panel super
// admin. `super_admin` se modela aparte vía `profiles.is_super_admin`.
export const MEMBERSHIP_ROLES = [
  ROLES.ADMINISTRADOR_GENERAL,
  ROLES.ADMINISTRATIVO,
  ROLES.OPERARIO,
  ROLES.CONTABLE,
  ROLES.MANTENIMIENTO,
  ROLES.COMUNICACIONES,
  ROLES.RESTAURANTES,
  ROLES.SEGURIDAD,
  ROLES.SOCIO,
  ROLES.INVITADO,
  ROLES.PROVEEDOR,
] as const;

export const ROL_LABELS: Record<Rol, string> = {
  super_admin: 'Super admin',
  administrador_general: 'Admin',
  administrativo: 'Administrativo',
  operario: 'Operario',
  contable: 'Contable',
  mantenimiento: 'Mantenimiento',
  comunicaciones: 'Comunicaciones',
  restaurantes: 'Restaurantes',
  seguridad: 'Portería / Seguridad',
  socio: 'Socio',
  invitado: 'Invitado',
  proveedor: 'Proveedor',
};
