import Link from 'next/link';
import Image from 'next/image';

const navLinks = [
  { href: '#caracteristicas', label: 'Características' },
  { href: '#modulos', label: 'Módulos' },
  { href: '#ecosistema', label: 'Servicios' },
];

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0e3d44]/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-4 md:px-8">
        <Link href="/" className="flex items-center">
          <Image
            src="/landing/logoHeader.png"
            alt="NauticApp"
            width={200}
            height={50}
            priority
            className="h-10 w-auto"
          />
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-bold text-white/90 transition hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/onboarding"
            className="hidden rounded-lg bg-[#ABC2B3] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#9bb5a3] sm:inline-flex"
          >
            Registrá tu club
          </Link>
          <Link
            href="/login"
            className="rounded-lg bg-[#175861] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#124a52]"
          >
            Log in
          </Link>
        </div>
      </div>
    </header>
  );
}
