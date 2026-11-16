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
import { METODOS_AMORTIZACION, VIDAS_UTILES } from '@/lib/bienes-uso/constantes';
import type { BienDetalle } from '@/lib/bienes-uso/consultas';
import type { PersonaSelector } from '@/lib/legajo/consultas';
import { MONEDAS } from '@/lib/proveedores/constantes';

/**
 * Datos contables del bien: valor de origen, moneda, fechas de inicio de marcha y de
 * amortización, vida útil, método de amortización y proveedor (a quién se le compró).
 */
export function TabContable({
  det,
  proveedores,
}: {
  det: BienDetalle;
  proveedores: PersonaSelector[];
}) {
  const b = det.bien;
  const { pending, ejecutar } = useAccion();
  const [f, setF] = useState({
    valorOrigen: b.valorOrigen === null ? '' : String(b.valorOrigen),
    moneda: b.moneda,
    fechaInicioMarcha: b.fechaInicioMarcha ?? '',
    fechaInicioAmortizacion: b.fechaInicioAmortizacion ?? '',
    vidaUtilAnios: b.vidaUtilAnios ? String(b.vidaUtilAnios) : '',
    metodoAmortizacion: b.metodoAmortizacion,
    proveedorId: b.proveedorId ?? '',
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const origen = f.valorOrigen.trim() === '' ? null : Number(f.valorOrigen);
  const origenMal = origen !== null && (!Number.isFinite(origen) || origen < 0);

  // Un proveedor que ya no está activo sigue figurando si es el que tiene cargado el bien.
  const opcionesProveedor = proveedores.some((p) => p.value === f.proveedorId)
    ? proveedores
    : f.proveedorId
      ? [{ value: f.proveedorId, label: 'Proveedor inactivo o dado de baja' }, ...proveedores]
      : proveedores;

  return (
    <Tarjeta
      titulo="Datos contables"
      acciones={
        <button
          type="button"
          className={botonPrimario}
          disabled={pending || origenMal}
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
        <Campo label="Fecha Inicio Marcha" ayuda="Cuándo el bien empezó a funcionar.">
          <input
            type="date"
            className={inputCls}
            value={f.fechaInicioMarcha}
            onChange={(e) => set('fechaInicioMarcha', e.target.value)}
          />
        </Campo>
        <Campo label="Fecha Inicio Amortización" ayuda="Desde cuándo se amortiza.">
          <input
            type="date"
            className={inputCls}
            value={f.fechaInicioAmortizacion}
            onChange={(e) => set('fechaInicioAmortizacion', e.target.value)}
          />
        </Campo>
        <Campo label="Vida útil" requerido ayuda="Se puede cambiar acá o en Datos generales.">
          <Selector
            value={f.vidaUtilAnios}
            onChange={(v) => set('vidaUtilAnios', v)}
            opciones={VIDAS_UTILES}
            placeholder="Elegí la vida útil"
          />
        </Campo>
        <Campo label="Método" requerido>
          <Selector
            value={f.metodoAmortizacion}
            onChange={(v) => set('metodoAmortizacion', v)}
            opciones={METODOS_AMORTIZACION}
            placeholder="Elegí el método"
          />
        </Campo>
        <Campo
          label="Proveedor"
          ayuda="A quién se le compró el bien. Se elige de Proveedores."
          className="md:col-span-2"
        >
          <select
            className={inputCls}
            value={f.proveedorId}
            onChange={(e) => set('proveedorId', e.target.value)}
          >
            <option value="">Sin proveedor</option>
            {opcionesProveedor.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </Campo>
      </div>
    </Tarjeta>
  );
}
