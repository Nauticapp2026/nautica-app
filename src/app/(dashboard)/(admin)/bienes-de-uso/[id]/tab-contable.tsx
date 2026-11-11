'use client';

import { useState } from 'react';

import { actualizarContablesAction } from '@/app/actions/bienes-uso';
import {
  Campo,
  Selector,
  Tarjeta,
  botonPrimario,
  inputCls,
  useAccion,
} from '@/components/shared/form-ui';
import { calcularAmortizacion } from '@/lib/bienes-uso/amortizacion';
import type { BienDetalle } from '@/lib/bienes-uso/consultas';
import { MONEDAS } from '@/lib/proveedores/constantes';

const SIMBOLO: Record<string, string> = {
  ARS: '$',
  USD: 'US$',
  EUR: '€',
  BRL: 'R$',
  UYU: '$U',
  CLP: 'CLP$',
  PYG: '₲',
};

function dinero(n: number, moneda: string): string {
  return `${SIMBOLO[moneda] ?? moneda} ${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const MESES = [
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
const mesLegible = (ym: string) => `${MESES[Number(ym.slice(5, 7)) - 1]} de ${ym.slice(0, 4)}`;

/**
 * Datos contables para la amortización: valor de origen, valor residual y desde cuándo se
 * amortiza. La vida útil se carga en Datos generales. Amortización lineal por meses.
 */
export function TabContable({ det, hoy }: { det: BienDetalle; hoy: string }) {
  const b = det.bien;
  const { pending, ejecutar } = useAccion();
  const [f, setF] = useState({
    valorOrigen: b.valorOrigen === null ? '' : String(b.valorOrigen),
    moneda: b.moneda,
    fechaInicioAmortizacion: b.fechaInicioAmortizacion ?? '',
    valorResidual: String(b.valorResidual),
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  // El cálculo de la pantalla usa lo que está escrito (vista previa); lo que cuenta es lo guardado.
  const origen = f.valorOrigen.trim() === '' ? null : Number(f.valorOrigen);
  const residual = f.valorResidual.trim() === '' ? 0 : Number(f.valorResidual);
  const valido =
    (origen === null || (Number.isFinite(origen) && origen >= 0)) &&
    Number.isFinite(residual) &&
    residual >= 0;
  const calc = calcularAmortizacion({
    valorOrigen: valido ? origen : null,
    valorResidual: valido ? residual : 0,
    vidaUtilAnios: b.vidaUtilAnios,
    inicio: f.fechaInicioAmortizacion || null,
    baja: b.fechaBaja,
    hoy,
  });
  const residualMayor = origen !== null && residual > origen;

  return (
    <div className="space-y-6">
      <Tarjeta
        titulo="Datos contables"
        descripcion="Con estos datos se calcula la amortización lineal del bien."
        acciones={
          <button
            type="button"
            className={botonPrimario}
            disabled={pending || !valido || residualMayor}
            onClick={() =>
              ejecutar(() => actualizarContablesAction(b.id, f), 'Datos contables guardados.')
            }
          >
            {pending ? 'Guardando…' : 'Guardar cambios'}
          </button>
        }
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Campo label="Valor de origen" ayuda="Lo que costó el bien (con decimales con punto).">
            <input
              type="number"
              min={0}
              step="0.01"
              className={inputCls}
              value={f.valorOrigen}
              onChange={(e) => set('valorOrigen', e.target.value)}
            />
          </Campo>
          <Campo label="Moneda">
            <Selector
              value={f.moneda}
              onChange={(v) => set('moneda', v)}
              opciones={MONEDAS}
              placeholder="Elegí la moneda"
            />
          </Campo>
          <Campo
            label="Inicio de la amortización"
            ayuda="Por defecto, la fecha de incorporación. Se cuenta el mes completo."
          >
            <input
              type="date"
              className={inputCls}
              value={f.fechaInicioAmortizacion}
              onChange={(e) => set('fechaInicioAmortizacion', e.target.value)}
            />
          </Campo>
          <Campo
            label="Valor residual"
            ayuda="Lo que se estima que vale al final de su vida útil (0 si no vale nada)."
          >
            <input
              type="number"
              min={0}
              step="0.01"
              className={inputCls}
              value={f.valorResidual}
              onChange={(e) => set('valorResidual', e.target.value)}
            />
            {residualMayor && (
              <p className="mt-1 text-xs text-red-600">
                No puede ser mayor que el valor de origen.
              </p>
            )}
          </Campo>
          <Campo label="Vida útil" ayuda="Se carga en Datos generales.">
            <input
              className={`${inputCls} bg-gray-50`}
              readOnly
              value={
                b.vidaUtilAnios
                  ? `${b.vidaUtilAnios} ${b.vidaUtilAnios === 1 ? 'año' : 'años'}`
                  : 'Sin definir'
              }
            />
          </Campo>
          <Campo label="Método">
            <input className={`${inputCls} bg-gray-50`} readOnly value="Lineal, por meses" />
          </Campo>
        </div>
      </Tarjeta>

      <Tarjeta
        titulo="Amortización"
        descripcion={`Calculada al ${hoy.split('-').reverse().join('/')}${b.fechaBaja ? ' (el bien está dado de baja: no sigue amortizando)' : ''}.`}
      >
        {!calc.calculable ? (
          <p className="text-sm text-gray-500">
            Para calcular la amortización falta cargar {calc.faltan.join(', ')}.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Dato titulo="Cuota mensual" valor={dinero(calc.cuotaMensual, f.moneda)} />
              <Dato titulo="Cuota anual" valor={dinero(calc.cuotaAnual, f.moneda)} />
              <Dato
                titulo="Amortización acumulada"
                valor={dinero(calc.acumulada, f.moneda)}
                detalle={`${calc.porcentajeAmortizado}% · ${calc.mesesAmortizados} de ${calc.mesesVidaUtil} meses`}
              />
              <Dato
                titulo="Valor contable actual"
                valor={dinero(calc.valorContable, f.moneda)}
                destacado
              />
            </div>
            <p className="mt-3 text-sm text-gray-600">
              Base amortizable: {dinero(calc.baseAmortizable, f.moneda)}.{' '}
              {calc.totalmenteAmortizado
                ? 'El bien ya está totalmente amortizado.'
                : `Termina de amortizarse en ${mesLegible(calc.mesFin)}.`}
            </p>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs tracking-wide text-gray-500 uppercase">
                    <th className="py-2 pr-4 font-semibold">Año</th>
                    <th className="py-2 pr-4 font-semibold">Meses</th>
                    <th className="py-2 pr-4 text-right font-semibold">Cuota del año</th>
                    <th className="py-2 text-right font-semibold">Acumulada</th>
                  </tr>
                </thead>
                <tbody>
                  {calc.cronograma.map((c) => (
                    <tr key={c.anio} className="border-b border-gray-100">
                      <td className="py-2 pr-4 font-medium text-gray-900">{c.anio}</td>
                      <td className="py-2 pr-4 text-gray-700">{c.meses}</td>
                      <td className="py-2 pr-4 text-right text-gray-700">
                        {dinero(c.cuota, f.moneda)}
                      </td>
                      <td className="py-2 text-right text-gray-900">
                        {dinero(c.acumulada, f.moneda)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Tarjeta>
    </div>
  );
}

function Dato({
  titulo,
  valor,
  detalle,
  destacado,
}: {
  titulo: string;
  valor: string;
  detalle?: string;
  destacado?: boolean;
}) {
  return (
    <div
      className={`rounded-[10px] border p-3 ${destacado ? 'border-[#669E9D] bg-teal-50/50' : 'border-gray-200'}`}
    >
      <p className="text-xs font-medium text-gray-500">{titulo}</p>
      <p className="mt-1 text-base font-bold" style={{ color: '#101828' }}>
        {valor}
      </p>
      {detalle && <p className="mt-0.5 text-xs text-gray-500">{detalle}</p>}
    </div>
  );
}
