import Image from 'next/image';

export function ComoFunciona() {
  return (
    <section id="caracteristicas" className="bg-white py-20">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-[#175861] md:text-4xl">
            Cómo funciona nuestro sistema
          </h2>
          <p className="mt-4 text-xl font-semibold text-[#175861]/90">
            Una solución simple, el socio navega, el club gestiona, todo fluye.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          <FlowCard
            iconSrc="/landing/como-funciona/1.png"
            title="El club gestiona todo automáticamente"
            description="El sistema sincroniza cuotas, accesos, facturación, camas y amarras, cuentas corrientes y comunicación interna."
          />
          <FlowCard
            iconSrc="/landing/como-funciona/2.png"
            title="El socio usa la App"
            description="Informa su salida, accede con QR al club, invita gente, recibe notificaciones, consulta el clima y mareas, gestiona su embarcación y compra mediante Nautishop."
          />
        </div>
      </div>
    </section>
  );
}

function FlowCard({
  iconSrc,
  title,
  description,
}: {
  iconSrc: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border-2 border-gray-200 bg-gradient-to-br from-white via-[#ABC2B3]/20 to-[#175861]/30 p-8 text-center">
      <div className="relative mx-auto size-12">
        <Image src={iconSrc} alt="" fill sizes="48px" className="object-contain" />
      </div>
      <h3 className="mt-6 text-lg font-bold text-[#175861]">{title}</h3>
      <p className="mt-3 text-sm font-bold text-[#175861]/90">{description}</p>
    </div>
  );
}
