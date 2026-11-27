import Image from 'next/image';
import { Check } from 'lucide-react';

import { Reveal } from './motion';

const features = [
  'Ventas',
  'Venta de amarras y camas',
  'Sistema de roles',
  'Visualización de tareas en tiempo real',
  'Estado de embarcaciones',
  'Comunicación',
  'Control de ingresos',
  'Integración de restaurante o buffet',
  'Notificaciones automáticas',
];

export function GestionFeatures() {
  return (
    <section className="overflow-hidden bg-[#eef5f2] py-24 md:py-32">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 md:grid-cols-2 md:px-8 lg:gap-20">
        <Reveal direction="zoom">
          <div className="relative aspect-[5/6] w-full overflow-hidden rounded-[2rem] shadow-[0_40px_60px_-30px_rgb(11_47_53/0.5)]">
            <Image
              src="/landing/gestion-features.png"
              alt="Panel de gestión administrativa"
              fill
              className="v2-parallax object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
          </div>
        </Reveal>

        <div>
          <Reveal>
            <h2 className="text-3xl leading-[1.08] font-extrabold tracking-tight text-balance text-[#0b2f35] md:text-5xl">
              Sistema de gestión administrativa integral.
            </h2>
          </Reveal>
          <ul className="mt-10 space-y-2">
            {features.map((feature, i) => (
              <li key={feature}>
                <Reveal direction="right" delay={i * 70}>
                  <div className="group flex items-center gap-4 rounded-2xl px-3 py-2.5 transition-colors duration-300 hover:bg-white">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#175861] transition-transform duration-500 group-hover:scale-110 group-hover:rotate-[-8deg]">
                      <Check className="size-4 text-white" strokeWidth={3} aria-hidden />
                    </span>
                    <span className="text-base font-medium text-[#0b2f35]">{feature}</span>
                  </div>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
