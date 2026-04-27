import Link from 'next/link';

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-[#0e3d44] text-white">
      <div
        className="absolute inset-0 -z-10 bg-cover bg-center opacity-40"
        style={{
          backgroundImage: 'linear-gradient(135deg, #0e3d44 0%, #175861 50%, #2a6f78 100%)',
        }}
        aria-hidden
      />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_30%_20%,rgba(102,158,157,0.4),transparent_60%)]" />

      <div className="mx-auto flex max-w-5xl flex-col items-center px-4 py-24 text-center md:py-32 lg:py-40">
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
            href="/signup"
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
