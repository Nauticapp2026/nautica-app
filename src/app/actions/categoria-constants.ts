// Labels de categoría de servicio (tipoServicioEnum), compartidos entre
// server actions y componentes cliente. Separado de facturacion.ts porque
// los archivos 'use server' solo pueden exportar async functions (Next.js
// 16 + Turbopack) — un const ahí rompe el build en runtime.
export const CATEGORIA_SERVICIO_LABEL: Record<string, string> = {
  espacio_guarda: 'Espacio de guarda',
  cuota_social: 'Cuota social',
  membresia: 'Membresía',
  expensas_ordinarias: 'Expensas ordinarias',
  expensas_extraordinarias: 'Expensas extraordinarias',
  servicio_extra: 'Servicio extra',
};
