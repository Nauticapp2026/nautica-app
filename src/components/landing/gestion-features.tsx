import { Check } from 'lucide-react';

const features = [
  'Facturación',
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
    <section className="bg-white py-20">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 md:grid-cols-2 md:px-8 lg:gap-16">
        <div className="flex aspect-[5/6] w-full items-center justify-center rounded-2xl bg-gradient-to-br from-[#175861]/10 to-[#175861]/30 text-sm text-[#175861]/60">
          {/* TODO: reemplazar con captura del panel admin */}
          Imagen panel admin
        </div>

        <div className="flex flex-col justify-center">
          <h2 className="text-2xl leading-tight font-bold text-[#175861] md:text-3xl">
            Sistema de gestión administrativa integral.
          </h2>
          <ul className="mt-8 space-y-3">
            {features.map((feature) => (
              <li key={feature} className="flex items-start gap-3">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[#669E9D]/15">
                  <Check className="size-3.5 text-[#669E9D]" strokeWidth={3} />
                </span>
                <span className="text-base font-semibold text-[#175861]">{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
