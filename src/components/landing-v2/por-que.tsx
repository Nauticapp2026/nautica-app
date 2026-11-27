import Image from 'next/image';

import { DownloadAppButton } from './download-app-button';
import { Reveal } from './motion';

const benefits = [
  'Solución 100% integrada y escalable.',
  'Implementación personalizada a medida.',
  'Aumenta los ingresos del club.',
  'Mejora la experiencia de los socios.',
  'Optimiza la gestión y reduce errores.',
];

export function PorQue() {
  return (
    <section className="relative overflow-hidden bg-[#0b2f35] pt-24 text-white md:py-32">
      <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-14 px-4 md:grid-cols-2 md:px-8 lg:gap-20">
        <div>
          <Reveal>
            <h2 className="text-4xl leading-[1.05] font-normal tracking-tight text-white md:text-6xl">
              ¿Por qué <span className="font-extrabold text-[#ABC2B3]">NauticApp</span>?
            </h2>
          </Reveal>
          <ul className="mt-10 divide-y divide-white/15">
            {benefits.map((b, i) => (
              <li key={b}>
                <Reveal delay={i * 90} direction="left">
                  <p className="flex items-center gap-4 py-4 text-lg leading-snug font-medium text-white md:text-xl">
                    <span className="size-2.5 shrink-0 rounded-full bg-[#669E9D]" aria-hidden />
                    {b}
                  </p>
                </Reveal>
              </li>
            ))}
          </ul>
          <Reveal delay={500}>
            <DownloadAppButton className="v2-btn mt-10 bg-[#ABC2B3] text-[#0b2f35] hover:bg-white" />
          </Reveal>
        </div>
      </div>

      {/* Foto a sangre a la derecha: el verde del fondo se degrada hasta fundirse con ella. */}
      <div className="relative mt-14 aspect-[4/5] w-full md:absolute md:inset-y-0 md:right-0 md:mt-0 md:aspect-auto md:w-[52%]">
        <Image
          src="/landing/por-que-v2.jpg"
          alt="App NauticApp en uso"
          fill
          className="object-cover object-[50%_20%]"
          sizes="(max-width: 768px) 100vw, 52vw"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0b2f35] via-transparent to-transparent md:bg-gradient-to-r md:from-[#0b2f35] md:via-[#0b2f35]/45 md:to-transparent md:to-60%" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#0b2f35]/70 to-transparent" />
      </div>
    </section>
  );
}
