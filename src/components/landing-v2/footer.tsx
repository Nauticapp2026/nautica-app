import Link from 'next/link';
import Image from 'next/image';

import { EMAIL_CONTACTO, EMAIL_CONTACTO_URL, WHATSAPP_URL } from '@/lib/contacto';

type FooterLink = {
  label: string;
  href: string;
  /** Sale del sitio (WhatsApp, mailto): `<a>` plano, no `Link` de Next. */
  externo?: boolean;
};

const columns: { title: string; links: FooterLink[] }[] = [
  {
    title: 'Producto',
    links: [
      { label: 'Características', href: '#caracteristicas' },
      { label: 'Módulos', href: '#modulos' },
      // { label: 'Servicios', href: '#ecosistema' }, // oculto momentáneamente junto con la sección
    ],
  },
  {
    title: 'Empresa',
    links: [
      { label: 'Sobre nosotros', href: '#' },
      // Contacto abre el WhatsApp de la empresa, y debajo va el mail por si
      // prefieren escribir (pedido del cliente 2026-09-17).
      { label: 'Contacto', href: WHATSAPP_URL, externo: true },
      { label: EMAIL_CONTACTO, href: EMAIL_CONTACTO_URL, externo: true },
      { label: 'Blog', href: '#' },
    ],
  },
  {
    title: 'Legal',
    links: [
      // Apuntaba a "#" y la página existe desde siempre: con la web ya pública
      // e indexable, un link legal muerto no puede quedar.
      { label: 'Términos y condiciones', href: '/terminos' },
      { label: 'Política de privacidad', href: '/privacidad' },
      { label: 'Admin', href: '/login' },
      { label: 'Restaurantes', href: '#' },
    ],
  },
];

const linkCls = 'text-sm font-bold transition hover:underline hover:opacity-100';

/**
 * Firma del estudio. Va igual en todos los proyectos de Cambalache, así que
 * NO se adapta a la paleta del sitio: el corazón es terracota `#FF7046`
 * hardcodeado a propósito (excepción a la regla 7 de CLAUDE.md, que pide usar
 * los tokens del design system).
 *
 * Detalles que NO son decorativos:
 * - `shapeRendering="crispEdges"`: sin eso el navegador antialiasea los
 *   cuadraditos y el pixel-art se ve sucio en vez de nítido.
 * - `aria-hidden` en el SVG + el `sr-only`: un lector de pantalla leería
 *   "Construido con imagen por Cambalache Studio" si no.
 * - El latido (`.animate-latido`, en globals.css) se apaga solo con
 *   `prefers-reduced-motion`.
 * Es un corazón dibujado a mano en vez del emoji ❤️ porque el emoji cambia de
 * dibujo según el sistema operativo y no se puede pintar del color de marca.
 */
const PIXELES_CORAZON: [number, number][] = [
  [2, 0],
  [4, 0],
  [8, 0],
  [10, 0],
  [0, 2],
  [2, 2],
  [4, 2],
  [6, 2],
  [8, 2],
  [10, 2],
  [12, 2],
  [0, 4],
  [2, 4],
  [4, 4],
  [6, 4],
  [8, 4],
  [10, 4],
  [12, 4],
  [2, 6],
  [4, 6],
  [6, 6],
  [8, 6],
  [10, 6],
  [4, 8],
  [6, 8],
  [8, 8],
  [6, 10],
];

function FirmaCambalache() {
  return (
    <a
      href="https://cambalache.studio"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-xs opacity-60 transition-opacity hover:opacity-100"
    >
      Construido con
      <svg
        width="12"
        height="11"
        viewBox="0 0 14 12"
        shapeRendering="crispEdges"
        aria-hidden="true"
        className="animate-latido"
      >
        {PIXELES_CORAZON.map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="2" height="2" fill="#FF7046" />
        ))}
      </svg>
      <span className="sr-only">cariño</span>
      por Cambalache Studio
    </a>
  );
}

export function Footer() {
  // pb-24 en mobile: el botón flotante de WhatsApp queda fijo abajo a la
  // derecha y, con el pie al ras, tapaba el final de la firma. El espacio extra
  // la deja por encima del botón al llegar al final de la página.
  return (
    <footer className="bg-[#2A6F78] pt-12 pb-24 text-white md:pb-12">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="space-y-4">
            <Image
              src="/landing/logoFooter.png"
              alt="NauticApp"
              width={200}
              height={50}
              className="h-10 w-auto"
            />
            <p className="max-w-[14rem] text-sm font-bold opacity-80">
              Digitalizamos la experiencia náutica
            </p>
          </div>

          {columns.map((col) => (
            <div key={col.title} className="space-y-4">
              <h4 className="text-base font-semibold">{col.title}</h4>
              <ul className="space-y-2 opacity-80">
                {col.links.map((link) => (
                  <li key={link.label}>
                    {link.externo ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`${linkCls} break-all`}
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link href={link.href} className={linkCls}>
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 border-t border-white/20 pt-8 text-center text-sm font-bold opacity-80">
          © 2025 NauticApp. Todos los derechos reservados.
        </div>

        <div className="mt-6 border-t border-white/20 pt-6 text-center">
          <FirmaCambalache />
        </div>
      </div>
    </footer>
  );
}
