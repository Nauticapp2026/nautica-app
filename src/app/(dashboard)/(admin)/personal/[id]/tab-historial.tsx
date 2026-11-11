'use client';

import type { LegajoDetalle } from '@/lib/legajo/consultas';

import { Tarjeta } from '@/components/shared/form-ui';

const fmt = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Solapa "Historial": quién cambió qué y cuándo (el CBU figura enmascarado). */
export function TabHistorial({ det }: { det: LegajoDetalle }) {
  return (
    <Tarjeta
      titulo="Historial de cambios"
      descripcion="Registro de las modificaciones del legajo. Los últimos 200 movimientos."
    >
      {det.historial.length === 0 ? (
        <p className="text-sm text-gray-500">Todavía no hay cambios registrados.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs tracking-wide text-gray-500 uppercase">
                <th className="py-2 pr-4 font-semibold">Cuándo</th>
                <th className="py-2 pr-4 font-semibold">Quién</th>
                <th className="py-2 pr-4 font-semibold">Campo</th>
                <th className="py-2 pr-4 font-semibold">Antes</th>
                <th className="py-2 font-semibold">Ahora</th>
              </tr>
            </thead>
            <tbody>
              {det.historial.map((h) => (
                <tr key={h.id} className="border-b border-gray-100 align-top">
                  <td className="py-2 pr-4 whitespace-nowrap text-gray-700">
                    {fmt.format(new Date(h.cuando))}
                  </td>
                  <td className="py-2 pr-4 text-gray-700">{h.por ?? '—'}</td>
                  <td className="py-2 pr-4 font-medium text-gray-900">{h.campo}</td>
                  <td className="max-w-[14rem] py-2 pr-4 break-words text-gray-500">
                    {h.anterior ?? '—'}
                  </td>
                  <td className="max-w-[14rem] py-2 break-words text-gray-900">{h.nuevo ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Tarjeta>
  );
}
