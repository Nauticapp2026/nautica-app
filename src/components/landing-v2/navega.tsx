import Image from 'next/image';
import { CloudSun, FileText, LifeBuoy, ShieldAlert } from 'lucide-react';

import { Reveal } from './motion';

const cards = [
  {
    icon: CloudSun,
    bg: '#175861',
    hover: '#ABC2B3',
    fg: '#ffffff',
    label: 'Clima, mareas y sudestadas en tiempo real',
    span: 'lg:col-span-4',
  },
  {
    icon: ShieldAlert,
    bg: '#669E9D',
    hover: '#0b2f35',
    fg: '#ffffff',
    label: 'Navegación segura con avisos y alertas',
    span: 'lg:col-span-2',
  },
  {
    icon: FileText,
    bg: '#ABC2B3',
    hover: '#175861',
    fg: '#0b2f35',
    label: 'Toda la documentación de tu barco en un solo lugar',
    span: 'lg:col-span-2',
  },
  {
    icon: LifeBuoy,
    bg: '#2A6F77',
    hover: '#ABC2B3',
    fg: '#ffffff',
    label: 'Contactos de emergencia y asistencia',
    span: 'lg:col-span-4',
  },
];

export function Navega() {
  return (
    <section
      id="modulos"
      className="relative isolate bg-[#0b2f35] pt-24 pb-24 text-white md:pt-32 md:pb-32"
    >
      <div className="v2-wave v2-wave-to-deep" aria-hidden />
      <div className="absolute inset-0 -z-10 overflow-hidden" aria-hidden>
        <Image
          src="/landing/navega-puerto.jpg"
          alt=""
          fill
          sizes="100vw"
          className="v2-parallax object-cover"
        />
        <div className="absolute inset-0 bg-[#0b2f35]/[0.88]" />
      </div>
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <Reveal>
          <h2 className="text-4xl leading-[1.05] font-normal tracking-tight md:text-6xl">
            Navegá <span className="font-extrabold text-[#ABC2B3]">sin problemas</span>
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-6">
          {cards.map(({ icon: Icon, label, span, bg, fg, hover }, i) => (
            <Reveal
              key={label}
              delay={i * 110}
              direction="zoom"
              className={`${span} sm:col-span-1`}
            >
              <div
                className="v2-tile v2-lift flex h-full min-h-56 flex-col justify-between rounded-[2rem] p-8 md:p-10"
                style={
                  {
                    backgroundColor: bg,
                    color: fg,
                    '--v2-icon-hover': hover,
                  } as React.CSSProperties
                }
              >
                <Icon className="v2-tile-icon size-10" strokeWidth={1.75} aria-hidden />
                <p className="mt-10 max-w-sm text-xl leading-snug font-medium md:text-2xl">
                  {label}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
