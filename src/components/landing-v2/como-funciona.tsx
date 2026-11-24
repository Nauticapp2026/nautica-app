import Image from 'next/image';

import { Reveal } from './motion';

export function ComoFunciona() {
  return (
    <section id="caracteristicas" className="bg-white py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <Reveal>
          <h2 className="max-w-3xl text-4xl leading-[1.05] font-extrabold tracking-tight text-balance text-[#0b2f35] md:text-6xl">
            Cómo funciona nuestro <span className="v2-underline">sistema</span>
          </h2>
          <p className="mt-6 max-w-xl text-xl font-semibold text-[#175861]">
            Una solución simple, el socio navega, el club gestiona, todo fluye.
          </p>
        </Reveal>

        <div className="mt-16 grid gap-6 md:grid-cols-12">
          <Reveal direction="left" className="md:col-span-7">
            <div className="v2-lift flex h-full flex-col justify-between rounded-[2rem] bg-[#0b2f35] p-8 text-white md:p-12">
              <div className="flex size-16 items-center justify-center rounded-full bg-white">
                <Image
                  src="/landing/como-funciona/1.png"
                  alt=""
                  width={40}
                  height={40}
                  className="size-10 object-contain"
                />
              </div>
              <div className="mt-20">
                <h3 className="text-2xl leading-tight font-bold md:text-4xl">
                  El club gestiona todo automáticamente
                </h3>
                <p className="mt-4 max-w-lg text-base leading-relaxed font-semibold text-white/80">
                  El sistema sincroniza cuotas, accesos, facturación, camas y amarras, cuentas
                  corrientes y comunicación interna.
                </p>
              </div>
            </div>
          </Reveal>

          <Reveal direction="right" delay={120} className="md:col-span-5">
            <div className="v2-lift flex h-full flex-col justify-between rounded-[2rem] bg-[#ABC2B3]/40 p-8 md:p-12">
              <div className="flex size-16 items-center justify-center rounded-full bg-white">
                <Image
                  src="/landing/como-funciona/2.png"
                  alt=""
                  width={40}
                  height={40}
                  className="size-10 object-contain"
                />
              </div>
              <div className="mt-20">
                <h3 className="text-2xl leading-tight font-bold text-[#0b2f35] md:text-3xl">
                  El socio usa la App
                </h3>
                <p className="mt-4 text-base leading-relaxed font-semibold text-[#175861]">
                  Informa su salida, accede con QR al club, invita gente, recibe notificaciones,
                  consulta el clima y mareas y gestiona su embarcación.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
