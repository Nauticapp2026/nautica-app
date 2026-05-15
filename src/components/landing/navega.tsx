import Image from 'next/image';

const cards = [
  { src: '/landing/navega/1.png', label: 'Clima, mareas y sudestadas en tiempo real' },
  { src: '/landing/navega/2.png', label: 'Navegación segura con avisos y alertas' },
  { src: '/landing/navega/3.png', label: 'Servicios técnicos, oficios y mucho más' },
  { src: '/landing/navega/4.png', label: 'Contactos de emergencia y asistencia' },
];

export function Navega() {
  return (
    <section id="modulos" className="bg-[#F3F4F6] py-20">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <h2 className="text-center text-3xl font-bold text-[#175861] md:text-4xl">
          Navegá sin problemas
        </h2>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map(({ src, label }) => (
            <div
              key={label}
              className="rounded-2xl border-2 border-gray-200 bg-gradient-to-br from-white via-[#669E9D]/15 to-[#175861]/35 p-6 text-center"
            >
              <div className="relative mx-auto mt-2 size-12">
                <Image src={src} alt="" fill sizes="48px" className="object-contain" />
              </div>
              <p className="mt-6 text-base leading-snug font-bold text-[#175861]">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
