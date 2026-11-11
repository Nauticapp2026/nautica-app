'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react';

import { eliminarHoraAction, guardarHoraAction } from '@/app/actions/legajo-horas';
import { fechaLegible } from '@/lib/documentacion-fechas';
import { todayArg } from '@/lib/dates';
import { NOVEDADES_HORA, TIPOS_HORA, labelDe } from '@/lib/legajo/constantes';
import type { HoraRegistrada } from '@/lib/legajo/consultas';
import { calcularHoras, formatearHoras } from '@/lib/legajo/validaciones';

import {
  Campo,
  Selector,
  Tarjeta,
  botonPrimario,
  botonSecundario,
  inputCls,
  useAccion,
} from '@/components/shared/form-ui';

const NOMBRE_MES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

function mesLegible(mes: string) {
  const [y, m] = mes.split('-').map(Number);
  return `${NOMBRE_MES[m - 1]} de ${y}`;
}

function mesVecino(mes: string, delta: number) {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const FORM_VACIO = {
  id: '',
  fecha: '',
  novedad: 'trabajado',
  desde: '',
  hasta: '',
  tipoHora: 'normal',
  nota: '',
};

/**
 * Horas trabajadas y novedades del mes. Cargar horas reales (desde/hasta, tipo de hora) y
 * novedades del día (enfermedad, licencia, vacaciones, ausencia, feriado). La fecha de ingreso
 * del empleado bloquea cargas anteriores.
 */
export function TabHoras({
  empleadoId,
  fechaIngreso,
  mes,
  horas,
}: {
  empleadoId: string;
  fechaIngreso: string;
  mes: string;
  horas: HoraRegistrada[];
}) {
  const router = useRouter();
  const { pending, ejecutar } = useAccion();
  const [f, setF] = useState({ ...FORM_VACIO, fecha: todayArg() });
  const set = <K extends keyof typeof f>(k: K, v: string) => setF((p) => ({ ...p, [k]: v }));

  const irAlMes = (m: string) => router.replace(`?tab=horas&mes=${m}`, { scroll: false });

  const esTrabajado = f.novedad === 'trabajado';
  const calculadas =
    esTrabajado && f.desde && f.hasta && f.desde !== f.hasta
      ? calcularHoras(f.desde, f.hasta)
      : null;
  const totalTrabajadas = horas
    .filter((h) => h.novedad === 'trabajado')
    .reduce((s, h) => s + h.horas, 0);
  const antesDelIngreso = f.fecha !== '' && f.fecha < fechaIngreso;

  function guardar() {
    ejecutar(
      () =>
        guardarHoraAction(empleadoId, {
          id: f.id || undefined,
          fecha: f.fecha,
          novedad: f.novedad,
          desde: f.desde,
          hasta: f.hasta,
          tipoHora: f.tipoHora,
          nota: f.nota,
        }),
      f.id ? 'Registro actualizado.' : 'Registro guardado.',
      () => setF((p) => ({ ...FORM_VACIO, fecha: p.fecha })),
    );
  }

  function editar(h: HoraRegistrada) {
    setF({
      id: h.id,
      fecha: h.fecha,
      novedad: h.novedad,
      desde: h.desde ?? '',
      hasta: h.hasta ?? '',
      tipoHora: h.tipoHora,
      nota: h.nota ?? '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="space-y-6">
      <Tarjeta
        titulo={f.id ? 'Editar registro' : 'Cargar horas o novedad'}
        descripcion="Un día trabajado lleva desde y hasta; las novedades (enfermedad, licencia, vacaciones, ausencia, feriado) pueden ir sin horario."
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Campo label="Fecha" requerido>
            <input
              type="date"
              className={inputCls}
              value={f.fecha}
              min={fechaIngreso}
              onChange={(x) => set('fecha', x.target.value)}
            />
            {antesDelIngreso && (
              <p className="mt-1 text-xs text-red-600">
                No se puede cargar antes de la fecha de ingreso ({fechaLegible(fechaIngreso)}).
              </p>
            )}
          </Campo>
          <Campo label="Novedad" requerido>
            <Selector
              value={f.novedad}
              onChange={(v) => set('novedad', v)}
              opciones={NOVEDADES_HORA}
              placeholder="Elegí la novedad"
            />
          </Campo>
          <Campo label="Tipo de hora">
            <Selector
              value={f.tipoHora}
              onChange={(v) => set('tipoHora', v)}
              opciones={TIPOS_HORA}
              placeholder="Elegí el tipo"
            />
          </Campo>
          <Campo label={esTrabajado ? 'Hora desde' : 'Hora desde (opcional)'}>
            <input
              type="time"
              className={inputCls}
              value={f.desde}
              onChange={(x) => set('desde', x.target.value)}
            />
          </Campo>
          <Campo
            label={esTrabajado ? 'Hora hasta' : 'Hora hasta (opcional)'}
            ayuda={calculadas !== null ? `Son ${formatearHoras(calculadas)}.` : undefined}
          >
            <input
              type="time"
              className={inputCls}
              value={f.hasta}
              onChange={(x) => set('hasta', x.target.value)}
            />
          </Campo>
          <Campo label="Nota">
            <input
              className={inputCls}
              value={f.nota}
              maxLength={500}
              onChange={(x) => set('nota', x.target.value)}
            />
          </Campo>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          {f.id && (
            <button
              type="button"
              className={botonSecundario}
              onClick={() => setF({ ...FORM_VACIO, fecha: todayArg() })}
            >
              Cancelar edición
            </button>
          )}
          <button
            type="button"
            className={botonPrimario}
            disabled={pending || !f.fecha || antesDelIngreso}
            onClick={guardar}
          >
            {pending ? 'Guardando…' : f.id ? 'Guardar cambios' : 'Guardar'}
          </button>
        </div>
      </Tarjeta>

      <Tarjeta
        titulo={`Registro de ${mesLegible(mes)}`}
        acciones={
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Mes anterior"
              className={botonSecundario}
              onClick={() => irAlMes(mesVecino(mes, -1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={botonSecundario}
              onClick={() => irAlMes(todayArg().slice(0, 7))}
            >
              Hoy
            </button>
            <button
              type="button"
              aria-label="Mes siguiente"
              className={botonSecundario}
              onClick={() => irAlMes(mesVecino(mes, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        }
      >
        {horas.length === 0 ? (
          <p className="text-sm text-gray-500">No hay registros en este mes.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs tracking-wide text-gray-500 uppercase">
                    <th className="py-2 pr-4 font-semibold">Fecha</th>
                    <th className="py-2 pr-4 font-semibold">Novedad</th>
                    <th className="py-2 pr-4 font-semibold">Horario</th>
                    <th className="py-2 pr-4 font-semibold">Tipo</th>
                    <th className="py-2 pr-4 text-right font-semibold">Horas</th>
                    <th className="py-2 pr-4 font-semibold">Nota</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {horas.map((h) => {
                    const nov = NOVEDADES_HORA.find((n) => n.value === h.novedad);
                    return (
                      <tr key={h.id} className="border-b border-gray-100">
                        <td className="py-2 pr-4 text-gray-900">{fechaLegible(h.fecha)}</td>
                        <td className="py-2 pr-4">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${nov?.clase ?? 'bg-gray-100 text-gray-600'}`}
                          >
                            {nov?.label ?? h.novedad}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-gray-700">
                          {h.desde && h.hasta ? `${h.desde} a ${h.hasta}` : '—'}
                        </td>
                        <td className="py-2 pr-4 text-gray-700">
                          {h.novedad === 'trabajado' ? labelDe(TIPOS_HORA, h.tipoHora) : '—'}
                        </td>
                        <td className="py-2 pr-4 text-right font-medium text-gray-900">
                          {h.novedad === 'trabajado' ? formatearHoras(h.horas) : '—'}
                        </td>
                        <td className="max-w-[14rem] truncate py-2 pr-4 text-gray-500">
                          {h.nota ?? ''}
                        </td>
                        <td className="py-2 text-right">
                          <button
                            type="button"
                            aria-label="Editar"
                            className="rounded-[8px] p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                            onClick={() => editar(h)}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            aria-label="Eliminar"
                            disabled={pending}
                            className="rounded-[8px] p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                            onClick={() => {
                              if (window.confirm('¿Eliminar este registro?')) {
                                ejecutar(
                                  () => eliminarHoraAction(empleadoId, h.id),
                                  'Registro eliminado.',
                                );
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-right text-sm text-gray-600">
              Horas trabajadas en el mes:{' '}
              <span className="font-semibold text-gray-900">{formatearHoras(totalTrabajadas)}</span>
            </p>
          </>
        )}
      </Tarjeta>
    </div>
  );
}
