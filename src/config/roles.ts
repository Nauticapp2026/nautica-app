/**
 * Roles de la plataforma.
 * - super_admin: Anthropic/vos. Acceso global a todas las guarderías.
 * - marina_admin: Dueño/administrador general de UNA guardería.
 * - operator: Operario de la guardería (tareas diarias).
 * - member: Socio de la guardería (tiene una o más embarcaciones).
 * - provider: Proveedor externo (acceso limitado a órdenes de trabajo).
 * - guest: Invitado con acceso temporal y acotado.
 */
export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  MARINA_ADMIN: 'marina_admin',
  OPERATOR: 'operator',
  MEMBER: 'member',
  PROVIDER: 'provider',
  GUEST: 'guest',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ALL_ROLES: Role[] = Object.values(ROLES);
