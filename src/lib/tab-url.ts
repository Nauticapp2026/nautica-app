/**
 * Pestañas que sobreviven a un refresh (F5).
 *
 * La pestaña activa vive en la query string (`?tab=...`), no en el estado del
 * componente: así refrescar la página —o compartir el link— cae en la misma
 * vista. Antes se volvía siempre a la primera pestaña (pedido cliente
 * 2026-08-18: "si el usuario actualiza la página debe quedarse donde está").
 *
 * El valor inicial lo lee el Server Component de `searchParams` y lo pasa como
 * prop, así el primer render ya sale con la pestaña correcta (sin parpadeo).
 * `escribirTabEnUrl` actualiza la URL al cambiar de pestaña.
 */

// Los ids de pestaña viven ACÁ y no en cada pantalla, porque los consumen las
// dos orillas: el Server Component (para validar el `?tab=`) y el client (para
// tipar su estado). Un valor exportado desde un archivo 'use client' NO cruza
// al servidor — llega un proxy de referencia, no el array, y `.includes` explota
// en runtime. Mismo motivo por el que los icons del sidebar viven dentro del
// módulo cliente (ver CLAUDE.md).
export const SOCIO_TAB_IDS = [
  'generales',
  'impositivos',
  'embarcacion',
  'servicios-contratados',
  'cuenta-corriente',
  'navegantes',
  'invitados',
  'salidas',
  'documentacion',
  'payway',
] as const;
export type SocioTabId = (typeof SOCIO_TAB_IDS)[number];

export const VENTAS_TAB_IDS = ['afip', 'recibos'] as const;
export type VentasTab = (typeof VENTAS_TAB_IDS)[number];

export const COBRANZAS_TAB_IDS = ['todas', 'cobranzas', 'payway'] as const;
export type CobranzasTab = (typeof COBRANZAS_TAB_IDS)[number];

export const SOLICITUDES_TAB_IDS = ['pendientes', 'resueltas'] as const;
export type SolicitudesTab = (typeof SOLICITUDES_TAB_IDS)[number];

export const MODERACION_TAB_IDS = ['comunicaciones', 'publicaciones'] as const;
export type ModeracionTab = (typeof MODERACION_TAB_IDS)[number];

/**
 * Valida el `?tab=` de la URL contra las pestañas conocidas. Un valor viejo o
 * inventado cae al default en vez de dejar la pantalla en blanco.
 */
export function tabDesdeUrl<T extends string>(
  valor: string | undefined,
  validas: readonly T[],
  porDefecto: T,
): T {
  return validas.includes(valor as T) ? (valor as T) : porDefecto;
}

/**
 * Refleja la pestaña activa en la URL sin navegar.
 *
 * Usa `history.replaceState` y NO `router.replace`: en el App Router un
 * `router.replace` dispara una navegación que vuelve a ejecutar el Server
 * Component (re-fetch de todos los datos de la pantalla) en cada clic de
 * pestaña. Acá solo hace falta que la barra de direcciones acompañe.
 *
 * `replaceState` (en vez de `pushState`) para no llenar el historial: el botón
 * Atrás sigue saliendo de la pantalla, no recorriendo pestaña por pestaña.
 */
export function escribirTabEnUrl(tab: string, porDefecto: string): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    // La pestaña por defecto no ensucia la URL.
    if (tab === porDefecto) url.searchParams.delete('tab');
    else url.searchParams.set('tab', tab);
    window.history.replaceState(window.history.state, '', url.toString());
  } catch {
    // Si el navegador bloquea history (iframe sandbox, etc.), la pestaña
    // sigue funcionando: solo no se recuerda al refrescar.
  }
}
