import Link from 'next/link';
import Image from 'next/image';

const benefits = [
  'Solución 100% integrada y escalable.',
  'Implementación personalizada a medida.',
  'Aumenta los ingresos del club.',
  'Mejora la experiencia de los socios.',
  'Optimiza la gestión y reduce errores.',
];

export function PorQue() {
  return (
    <section className="bg-white py-20">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 md:grid-cols-2 md:px-8 lg:gap-16">
        <div className="flex flex-col items-center text-center md:items-start md:text-left">
          <h2 className="text-3xl leading-tight font-bold text-[#175861] md:text-4xl">
            ¿Por qué NauticApp?
          </h2>
          <ul className="mt-8 space-y-3 text-lg leading-snug font-semibold text-[#175861]">
            {benefits.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <Link
            href="#"
            aria-disabled
            className="mt-10 inline-flex cursor-not-allowed rounded-lg bg-[#175861] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#124a52]"
          >
            Descargar app
          </Link>
        </div>

        <div className="relative aspect-[5/6] w-full overflow-hidden md:order-last">
          <Image
            src="/landing/8.png"
            alt="App NauticApp en uso"
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 50vw"
          />
        </div>
      </div>
    </section>
  );
}
