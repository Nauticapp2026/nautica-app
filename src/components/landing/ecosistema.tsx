import Link from 'next/link';
import Image from 'next/image';

const items = [
  { label: 'Restaurantes', src: '/landing/3.png' },
  { label: 'Compra y venta de embarcaciones', src: '/landing/4.png' },
  { label: 'Propiedades', src: '/landing/5.png' },
  { label: 'Amarras y camas libres', src: '/landing/6.png' },
];

export function Ecosistema() {
  return (
    <section id="ecosistema" className="bg-white py-20">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-[#175861] md:text-4xl">Ecosistema Nautishop</h2>
          <p className="mt-3 text-xl font-semibold text-[#175861]/90">
            Comé, navegá, comprá, alquilá todo en un solo lugar
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item) => (
            <div
              key={item.label}
              className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
            >
              <div className="relative aspect-[3/4] w-full">
                <Image
                  src={item.src}
                  alt={item.label}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                />
              </div>
              <p className="px-3 py-4 text-center text-base font-semibold text-[#175861]">
                {item.label}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA banner */}
      <div className="relative mt-20 overflow-hidden py-16">
        <Image src="/landing/7.png" alt="" fill className="-z-10 object-cover" sizes="100vw" />
        <div className="absolute inset-0 -z-10 bg-[#175861]/80" />
        <div className="mx-auto max-w-4xl px-4 text-center text-white md:px-8">
          <h3 className="text-3xl leading-tight font-bold md:text-[33px]">
            Sumá tu negocio al mundo Náutico
          </h3>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-snug font-semibold">
            Mostrá tus servicios, recibí clientes y operá directamente desde la App.
            <br />
            Fácil, rápido y sin complicaciones.
          </p>
          <Link
            href="#"
            aria-disabled
            className="mt-8 inline-flex cursor-not-allowed rounded-lg bg-white px-6 py-3 text-sm font-bold text-[#175861] transition hover:bg-white/90"
          >
            Registrá tu negocio
          </Link>
        </div>
      </div>
    </section>
  );
}
