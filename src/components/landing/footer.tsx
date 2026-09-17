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

export function Footer() {
  return (
    <footer className="bg-[#2A6F78] py-12 text-white">
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
      </div>
    </footer>
  );
}
