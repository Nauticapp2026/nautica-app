'use client';

/**
 * Envoltorio de scroll horizontal para tablas anchas, con una barra de arrastre
 * propia que queda siempre visible al pie de la pantalla.
 *
 * El problema que resuelve: las tablas de Ventas miden 1700–2300px y la barra de
 * scroll nativa vive al pie del contenedor, así que con la tabla larga había que
 * bajar hasta el final para poder correrla y ver las columnas de la derecha
 * (pedido del cliente 2026-08-10).
 *
 * Dos decisiones que vienen de medir el comportamiento real, no de suponerlo:
 *
 * 1. `position: fixed` y no `sticky bottom-0`. El layout del dashboard tiene
 *    `overflow-auto` en `<main>` (src/app/(dashboard)/layout.tsx), pero `main`
 *    crece con el contenido y nunca scrollea: el que scrollea es el documento.
 *    Un `sticky bottom-0` se ancla al borde inferior de `main` — cientos de px
 *    por debajo del viewport — y no flota nunca. Se compensa el `bottom` a mano
 *    para imitar a sticky: la barra se pega al viewport mientras la tabla
 *    desborda hacia abajo, y descansa sobre el borde de la tabla si su pie ya
 *    está en pantalla.
 *
 * 2. Thumb dibujado a mano en vez de un scrollbar nativo prestado. En macOS los
 *    scrollbars son superpuestos: no reservan lugar y solo se pintan mientras se
 *    scrollea (medido: `offsetWidth - clientWidth === 0`). Un scrollbar nativo,
 *    propio o proxy, sería invisible estando quieto — justo lo contrario de lo
 *    que se pidió. Este se ve siempre y anda igual en Windows y Linux.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const ALTO_BARRA = 14;

export function TablaScrollX({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const realRef = useRef<HTMLDivElement>(null);
  const pistaRef = useRef<HTMLDivElement>(null);
  const arrastre = useRef<{ x0: number; scroll0: number } | null>(null);

  const [geo, setGeo] = useState<{
    left: number;
    width: number;
    bottom: number;
    scrollWidth: number;
    clientWidth: number;
    scrollLeft: number;
    visible: boolean;
  } | null>(null);

  const medir = useCallback(() => {
    const real = realRef.current;
    if (!real) return;
    const r = real.getBoundingClientRect();
    const vh = window.innerHeight;
    setGeo({
      left: r.left,
      width: r.width,
      // Imita a sticky: pegada al viewport mientras la tabla siga hacia abajo,
      // apoyada en el pie de la tabla cuando ya se ve el final.
      bottom: Math.max(0, vh - r.bottom),
      scrollWidth: real.scrollWidth,
      clientWidth: real.clientWidth,
      scrollLeft: real.scrollLeft,
      visible: r.bottom > 0 && r.top < vh,
    });
  }, []);

  useEffect(() => {
    const real = realRef.current;
    if (!real) return;
    medir();

    // El ancho cambia al abrir/cerrar el sidebar y al filtrar (cambia el
    // contenido), no solo al redimensionar la ventana.
    const ro = new ResizeObserver(medir);
    ro.observe(real);
    const tabla = real.firstElementChild;
    if (tabla) ro.observe(tabla);

    // En captura: el que scrollea puede ser un ancestro con overflow y en ese
    // caso el evento no burbujea hasta window.
    window.addEventListener('scroll', medir, { capture: true, passive: true });
    window.addEventListener('resize', medir, { passive: true });
    return () => {
      ro.disconnect();
      window.removeEventListener('scroll', medir, { capture: true });
      window.removeEventListener('resize', medir);
    };
  }, [medir]);

  // Arrastre del thumb: se escucha en window para que siga funcionando aunque el
  // puntero se salga de la barra.
  useEffect(() => {
    function onMove(e: PointerEvent) {
      const real = realRef.current;
      const pista = pistaRef.current;
      const a = arrastre.current;
      if (!real || !pista || !a) return;
      const anchoPista = pista.clientWidth;
      if (anchoPista <= 0) return;
      // Un píxel de pista equivale a scrollWidth/anchoPista píxeles de tabla.
      const factor = real.scrollWidth / anchoPista;
      real.scrollLeft = a.scroll0 + (e.clientX - a.x0) * factor;
      medir();
    }
    function onUp() {
      arrastre.current = null;
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [medir]);

  function handlePointerDownThumb(e: React.PointerEvent) {
    const real = realRef.current;
    if (!real) return;
    e.preventDefault();
    arrastre.current = { x0: e.clientX, scroll0: real.scrollLeft };
  }

  // Click en la pista (fuera del thumb): centrar ahí.
  function handlePointerDownPista(e: React.PointerEvent) {
    const real = realRef.current;
    const pista = pistaRef.current;
    if (!real || !pista) return;
    const r = pista.getBoundingClientRect();
    const prop = (e.clientX - r.left) / r.width;
    real.scrollLeft = prop * real.scrollWidth - real.clientWidth / 2;
    medir();
  }

  const desborda = geo != null && geo.scrollWidth > geo.clientWidth + 1;
  const mostrar = desborda && geo.visible;

  // Proporciones del thumb sobre la pista. Mínimo de 32px para que siga siendo
  // agarrable en tablas muy anchas.
  let thumbWidth = 0;
  let thumbLeft = 0;
  if (mostrar && geo) {
    const prop = geo.clientWidth / geo.scrollWidth;
    thumbWidth = Math.max(32, geo.width * prop);
    const maxLeft = geo.width - thumbWidth;
    const maxScroll = geo.scrollWidth - geo.clientWidth;
    thumbLeft = maxScroll > 0 ? (geo.scrollLeft / maxScroll) * maxLeft : 0;
  }

  return (
    <>
      <div ref={realRef} onScroll={medir} className={`overflow-x-auto ${className}`}>
        {children}
      </div>
      {mostrar && geo && (
        // Control redundante del contenedor real, que sigue siendo scrolleable
        // por teclado y por trackpad: se oculta a lectores de pantalla. z-40 lo
        // deja por debajo de los modales, que usan z-50.
        <div
          ref={pistaRef}
          aria-hidden="true"
          onPointerDown={handlePointerDownPista}
          className="fixed z-40 cursor-pointer border-t border-gray-200 bg-white/95 backdrop-blur"
          style={{
            left: geo.left,
            width: geo.width,
            bottom: geo.bottom,
            height: ALTO_BARRA,
          }}
        >
          <div
            onPointerDown={(e) => {
              e.stopPropagation();
              handlePointerDownThumb(e);
            }}
            className="absolute top-1/2 h-2 -translate-y-1/2 cursor-grab rounded-full bg-gray-400 transition-colors hover:bg-gray-500 active:cursor-grabbing active:bg-gray-600"
            style={{ width: thumbWidth, left: thumbLeft }}
          />
        </div>
      )}
    </>
  );
}
