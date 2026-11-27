import Image from 'next/image';
import { Check } from 'lucide-react';

import { Reveal } from './motion';

const features = [
  'Ventas.',
  'Venta de amarras y camas.',
  'Sistema de roles.',
  'Visualización de tareas en tiempo real.',
  'Estado de embarcaciones.',
  'Comunicación.',
  'Control de ingresos.',
  'Integración de restaurante o buffet.',
  'Notificaciones automáticas.',
];

export function GestionFeatures() {
  return (
    <section className="overflow-hidden bg-[#eef5f2] py-24 md:py-32">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 md:grid-cols-2 md:px-8 lg:gap-20">
        <Reveal direction="zoom">
          <div className="relative aspect-[5/6] w-full overflow-hidden rounded-[2rem] shadow-[0_40px_60px_-30px_rgb(11_47_53/0.5)]">
            <Image
              src="/landing/gestion-features-v2.jpg"
              alt="Administradora del club trabajando con NauticApp frente a la marina"
              fill
              className="v2-parallax object-cover object-[40%_15%]"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
          </div>
        </Reveal>

        <div>
          <Reveal>
            <h2 className="text-3xl leading-[1.08] font-normal tracking-tight text-balance text-[#0b2f35] md:text-5xl">
              Sistema de gestión <span className="font-extrabold">administrativa integral.</span>
            </h2>
          </Reveal>
          <ul className="mt-8 grid gap-x-3 gap-y-0.5 sm:grid-cols-2">
            {features.map((feature, i) => (
              <li key={feature}>
                <Reveal direction="right" delay={i * 50}>
                  <div className="group flex items-center gap-3 rounded-2xl px-2.5 py-2 transition-colors duration-300 hover:bg-white">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#175861] transition-colors duration-500 group-hover:bg-[#669E9D]">
                      <Check className="size-3.5 text-white" strokeWidth={2.5} aria-hidden />
                    </span>
                    <span className="text-[0.95rem] leading-snug font-medium text-[#0b2f35]">
                      {feature}
                    </span>
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
