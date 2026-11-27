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
    <section className="overflow-hidden bg-white py-24 md:py-32">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 md:grid-cols-2 md:px-8 lg:gap-20">
        <div>
          <Reveal>
            <h2 className="text-4xl leading-[1.05] font-normal tracking-tight text-[#0b2f35] md:text-6xl">
              ¿Por qué <span className="font-extrabold text-[#ABC2B3]">NauticApp</span>?
            </h2>
          </Reveal>
          <ul className="mt-10 divide-y divide-[#0b2f35]/10">
            {benefits.map((b, i) => (
              <li key={b}>
                <Reveal delay={i * 90} direction="left">
                  <p className="flex items-center gap-4 py-4 text-lg leading-snug font-medium text-[#175861] md:text-xl">
                    <span className="size-2.5 shrink-0 rounded-full bg-[#669E9D]" aria-hidden />
                    {b}
                  </p>
                </Reveal>
              </li>
            ))}
          </ul>
          <Reveal delay={500}>
            <DownloadAppButton className="v2-btn mt-10 bg-[#0b2f35] text-white hover:bg-[#175861]" />
          </Reveal>
        </div>

        <Reveal direction="zoom" className="md:order-last">
          <div className="v2-float relative aspect-[5/6] w-full overflow-hidden rounded-[2rem] shadow-[0_40px_60px_-30px_rgb(11_47_53/0.5)]">
            <Image
              src="/landing/por-que.png"
              alt="App NauticApp en uso"
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
