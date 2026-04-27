import Link from 'next/link';

const items = [
  { label: 'Restaurantes' },
  { label: 'Compra y venta de embarcaciones' },
  { label: 'Propiedades' },
  { label: 'Amarras y camas libres' },
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
              <div className="flex aspect-[3/4] items-center justify-center bg-gradient-to-br from-[#175861]/15 to-[#669E9D]/40 text-xs text-[#175861]/60">
                {/* TODO: reemplazar con imagen real */}
                Imagen
              </div>
              <p className="px-3 py-4 text-center text-base font-semibold text-[#175861]">
                {item.label}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA banner */}
      <div className="mt-20 bg-[#175861]/95 py-16">
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
