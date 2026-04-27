import Link from 'next/link';
import Image from 'next/image';

const columns = [
  {
    title: 'Producto',
    links: [
      { label: 'Características', href: '#caracteristicas' },
      { label: 'Módulos', href: '#modulos' },
      { label: 'Servicios', href: '#ecosistema' },
    ],
  },
  {
    title: 'Empresa',
    links: [
      { label: 'Sobre nosotros', href: '#' },
      { label: 'Contacto', href: '#' },
      { label: 'Blog', href: '#' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Términos y condiciones', href: '#' },
      { label: 'Política de privacidad', href: '#' },
      { label: 'Admin', href: '/login' },
      { label: 'Restaurantes', href: '#' },
    ],
  },
];

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
                    <Link
                      href={link.href}
                      className="text-sm font-bold transition hover:underline hover:opacity-100"
                    >
                      {link.label}
                    </Link>
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
