import Image from 'next/image';
import { Share2, User } from 'lucide-react';

import { Reveal } from './motion';

const paneles = [
  {
    foto: '/landing/2.png',
    fotoAlt: 'Panel de gestión del club en una computadora',
    Icono: Share2,
    titulo: 'El club gestiona todo automáticamente',
    bajada: 'El sistema sincroniza:',
    items: [
      'Cuotas',
      'Accesos',
      'Facturación',
      'Camas y amarras',
      'Cuentas corrientes',
      'Comunicación interna',
    ],
    fondo: '#0b2f35',
    direccion: 'left' as const,
    posicion: 'object-[50%_18%]',
  },
  {
    foto: '/landing/8.png',
    fotoAlt: 'Socio usando la app NauticApp en el celular',
    Icono: User,
    titulo: 'El socio usa la App',
    bajada: 'Desde el celular puede:',
    items: [
      'Informar su salida',
      'Acceder con QR al club',
      'Invitar gente',
      'Recibir notificaciones',
      'Consultar clima y mareas',
      'Gestionar su embarcación',
    ],
    fondo: '#175861',
    direccion: 'right' as const,
    posicion: 'object-[50%_30%]',
  },
];

export function ComoFunciona() {
  return (
    <section id="caracteristicas" className="bg-white py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <Reveal>
          <h2 className="max-w-3xl text-4xl leading-[1.05] font-normal tracking-tight text-balance text-[#0b2f35] md:text-6xl">
            Cómo funciona nuestro <span className="font-extrabold text-[#ABC2B3]">sistema</span>
          </h2>
          <p className="mt-6 max-w-xl text-xl font-medium text-[#175861]">
            Una solución simple, el socio navega, el club gestiona, todo fluye.
          </p>
        </Reveal>

        <div className="mt-16 grid gap-6 md:grid-cols-2">
          {paneles.map((p, i) => (
            <Reveal key={p.titulo} direction={p.direccion} delay={i * 120}>
              <article
                className="v2-lift group relative isolate flex min-h-[33rem] flex-col justify-end overflow-hidden rounded-[2rem] text-white md:min-h-[38rem]"
                style={{ backgroundColor: p.fondo }}
              >
                <Image
                  src={p.foto}
                  alt={p.fotoAlt}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className={`-z-10 object-cover ${p.posicion} transition-transform duration-[1400ms] ease-out group-hover:scale-[1.06]`}
                />
                <div
                  className="absolute inset-0 -z-10"
                  style={{
                    backgroundImage: `linear-gradient(to top, ${p.fondo} 10%, ${p.fondo}ee 45%, ${p.fondo}00 85%)`,
                  }}
                />

                <div className="p-6 md:p-10">
                  <p.Icono
                    className="mb-5 size-10 text-white transition-colors duration-500 group-hover:text-[#ABC2B3]"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  <h3 className="text-3xl leading-[1.05] font-semibold tracking-tight text-balance md:text-4xl">
                    {p.titulo}
                  </h3>
                  <p className="mt-4 text-base font-medium text-white/80">{p.bajada}</p>
                  <ul className="mt-4 flex flex-wrap gap-2">
                    {p.items.map((item, j) => (
                      <li key={item}>
                        <Reveal delay={300 + j * 70} direction="zoom">
                          <span className="inline-block rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-normal transition-colors duration-300 hover:bg-white hover:text-[#0b2f35]">
                            {item}
                          </span>
                        </Reveal>
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
