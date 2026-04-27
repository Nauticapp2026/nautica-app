import Link from 'next/link';
import Image from 'next/image';

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden bg-[#0e3d44] text-white">
      <Image src="/landing/hero-bg.png" alt="" fill priority className="object-cover" />
      <div className="absolute inset-0 bg-[#0e3d44]/45" />

      <div className="relative z-10 mx-auto flex max-w-5xl flex-col items-center px-4 py-24 text-center md:py-32 lg:py-40">
        <h1 className="text-4xl leading-[1.05] font-bold md:text-5xl lg:text-7xl">
          Digitalizamos la
          <br />
          experiencia náutica
        </h1>
        <p className="mt-8 max-w-3xl text-base leading-snug font-bold text-white/90 md:text-lg lg:text-xl">
          La plataforma definitiva para administrar clubes náuticos y potenciar la vida en el río.
          Tecnología para el club. Confort para quienes navegan.
        </p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/onboarding"
            className="rounded-lg bg-[#ABC2B3] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#9bb5a3]"
          >
            Registrá tu club
          </Link>
          <Link
            href="#"
            aria-disabled
            className="cursor-not-allowed rounded-lg bg-[#669E9D] px-6 py-3 text-sm font-bold text-white opacity-90 transition hover:bg-[#588a89]"
          >
            Descargar app
          </Link>
        </div>
      </div>
    </section>
  );
}
