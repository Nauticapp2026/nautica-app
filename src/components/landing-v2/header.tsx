'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';

const navLinks = [
  { href: '#caracteristicas', label: 'Características' },
  { href: '#modulos', label: 'Módulos' },
];

export function Header() {
  const [solid, setSolid] = useState(false);

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className="v2-header fixed inset-x-0 top-0 z-50" data-solid={solid}>
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-4 md:px-8">
        <Link href="/v2" className="flex items-center">
          <Image
            src="/landing/logoHeader.png"
            alt="NauticApp"
            width={200}
            height={50}
            priority
            className="h-10 w-auto"
          />
        </Link>

        <nav className="hidden items-center gap-9 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="v2-link text-sm font-bold text-white/90 transition-colors hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/onboarding"
            className="hidden rounded-full bg-[#ABC2B3] px-5 py-2.5 text-sm font-bold text-[#0b2f35] transition hover:bg-white sm:inline-flex"
          >
            Registrá tu club
          </Link>
          <Link
            href="/login"
            className="rounded-full border border-white/40 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-white hover:text-[#0b2f35]"
          >
            Log in
          </Link>
        </div>
      </div>
    </header>
  );
}
