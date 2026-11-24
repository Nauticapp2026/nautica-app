import Image from 'next/image';
import { FileText } from 'lucide-react';

import { Reveal } from './motion';

const cards = [
  {
    src: '/landing/navega/1.png',
    label: 'Clima, mareas y sudestadas en tiempo real',
    span: 'lg:col-span-4',
  },
  {
    src: '/landing/navega/2.png',
    label: 'Navegación segura con avisos y alertas',
    span: 'lg:col-span-2',
  },
  {
    icon: FileText,
    label: 'Toda la documentación de tu barco en un solo lugar',
    span: 'lg:col-span-2',
  },
  {
    src: '/landing/navega/4.png',
    label: 'Contactos de emergencia y asistencia',
    span: 'lg:col-span-4',
  },
];

export function Navega() {
  return (
    <section
      id="modulos"
      className="relative bg-[#0b2f35] pt-24 pb-24 text-white md:pt-32 md:pb-32"
    >
      <div className="v2-wave v2-wave-to-deep" aria-hidden />
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <Reveal>
          <h2 className="text-4xl leading-[1.05] font-extrabold tracking-tight md:text-6xl">
            Navegá <span className="text-[#ABC2B3]">sin problemas</span>
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-6">
          {cards.map(({ src, icon: Icon, label, span }, i) => (
            <Reveal
              key={label}
              delay={i * 110}
              direction="zoom"
              className={`${span} sm:col-span-1`}
            >
              <div className="v2-tile v2-lift flex h-full min-h-56 flex-col justify-between rounded-[2rem] bg-[#175861] p-8 md:p-10">
                <div className="v2-tile-icon relative flex size-16 items-center justify-center rounded-full bg-white">
                  {Icon ? (
                    <Icon className="size-8 text-[#175861]" strokeWidth={2} aria-hidden />
                  ) : (
                    src && (
                      <Image
                        src={src}
                        alt=""
                        width={40}
                        height={40}
                        className="size-10 object-contain"
                      />
                    )
                  )}
                </div>
                <p className="mt-10 max-w-sm text-xl leading-snug font-bold md:text-2xl">{label}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
