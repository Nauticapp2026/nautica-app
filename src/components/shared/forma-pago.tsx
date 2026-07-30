'use client';

import React from 'react';

import { MEDIOS_PAGO } from '@/lib/medios-pago';

// Opciones de forma de pago, compartidas entre el alta de pago del socio
// (cuenta corriente) y el Registro de Cobranza. La lista canónica vive en
// src/lib/medios-pago.ts (module compartido con server actions).
export const FORMAS_PAGO = MEDIOS_PAGO;

export const inputCls =
  'h-11 w-full rounded-[10px] border border-gray-200 bg-white px-4 text-sm text-[#101828] focus:border-[#175861] focus:outline-none focus:ring-1 focus:ring-[#175861]';

// Filtra a digitos + un separador decimal (acepta coma o punto).
// El usuario ve lo que tipea sin reformatear en cada keystroke.
export function sanitizeMontoInput(raw: string): string {
  let out = raw.replace(/[^0-9.,]/g, '');
  // Permitir solo un separador decimal: dejar el primero, sacar los siguientes.
  const firstSep = out.search(/[.,]/);
  if (firstSep >= 0) {
    out = out.slice(0, firstSep + 1) + out.slice(firstSep + 1).replace(/[.,]/g, '');
  }
  return out;
}

// Convierte el input del usuario al formato que esperan los actions (parseFloat).
export function montoToNumberStr(input: string): string {
  return input.replace(',', '.');
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold" style={{ color: '#101828' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

// Campos dinámicos según la forma de pago elegida. Presentacional: recibe el
// estado `datosPago` y su setter desde el modal contenedor.
export function FormaPagoFields({
  formaDePago,
  datosPago,
  setDatosPago,
}: {
  formaDePago: string;
  datosPago: Record<string, string>;
  setDatosPago: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) {
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setDatosPago((prev) => ({ ...prev, [k]: e.target.value }));
  const val = (k: string) => datosPago[k] ?? '';

  if (!formaDePago || formaDePago === 'efectivo') return null;

  if (formaDePago === 'tarjeta_credito') {
    return (
      <>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Banco / Entidad">
            <input
              className={inputCls}
              placeholder="Banco"
              value={val('banco')}
              onChange={set('banco')}
            />
          </Field>
          <Field label="Últimos 4 dígitos">
            <input
              className={inputCls}
              placeholder="1234"
              maxLength={4}
              value={val('ultimos4')}
              onChange={set('ultimos4')}
            />
          </Field>
        </div>
        <Field label="Cuotas">
          <select className={inputCls} value={val('cuotas')} onChange={set('cuotas')}>
            <option value="">Seleccione...</option>
            {[1, 2, 3, 6, 9, 12, 18, 24].map((n) => (
              <option key={n} value={String(n)}>
                {n === 1 ? 'Contado' : `${n} cuotas`}
              </option>
            ))}
          </select>
        </Field>
      </>
    );
  }

  if (formaDePago === 'tarjeta_debito') {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Banco / Entidad">
          <input
            className={inputCls}
            placeholder="Banco"
            value={val('banco')}
            onChange={set('banco')}
          />
        </Field>
        <Field label="Últimos 4 dígitos">
          <input
            className={inputCls}
            placeholder="1234"
            maxLength={4}
            value={val('ultimos4')}
            onChange={set('ultimos4')}
          />
        </Field>
      </div>
    );
  }

  if (formaDePago === 'debito_automatico') {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Banco / Entidad">
          <input
            className={inputCls}
            placeholder="Banco"
            value={val('banco')}
            onChange={set('banco')}
          />
        </Field>
        <Field label="CBU / Alias">
          <input
            className={inputCls}
            placeholder="CBU / Alias"
            value={val('cbuAlias')}
            onChange={set('cbuAlias')}
          />
        </Field>
      </div>
    );
  }

  if (formaDePago === 'transferencia') {
    return (
      <>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Banco origen">
            <input
              className={inputCls}
              placeholder="Banco"
              value={val('banco')}
              onChange={set('banco')}
            />
          </Field>
          <Field label="Nombre del titular">
            <input
              className={inputCls}
              placeholder="Nombre"
              value={val('titular')}
              onChange={set('titular')}
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="CBU / Alias">
            <input
              className={inputCls}
              placeholder="CBU / Alias"
              value={val('cbuAlias')}
              onChange={set('cbuAlias')}
            />
          </Field>
          <Field label="Importe">
            <input
              className={inputCls}
              inputMode="decimal"
              placeholder="0,00"
              value={val('importe')}
              onChange={set('importe')}
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Fecha de transferencia">
            <input type="date" className={inputCls} value={val('fecha')} onChange={set('fecha')} />
          </Field>
          <Field label="Nro. de operación / ref.">
            <input
              className={inputCls}
              placeholder="Número"
              value={val('nroOperacion')}
              onChange={set('nroOperacion')}
            />
          </Field>
        </div>
        <Field label="Observaciones">
          <input
            className={inputCls}
            placeholder="Observaciones"
            value={val('observaciones')}
            onChange={set('observaciones')}
          />
        </Field>
      </>
    );
  }

  if (formaDePago === 'cheque') {
    return (
      <>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Número de cheque">
            <input
              className={inputCls}
              placeholder="Número"
              value={val('numeroCheque')}
              onChange={set('numeroCheque')}
            />
          </Field>
          <Field label="Banco emisor">
            <input
              className={inputCls}
              placeholder="Banco"
              value={val('banco')}
              onChange={set('banco')}
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Sucursal">
            <input
              className={inputCls}
              placeholder="Sucursal"
              value={val('sucursal')}
              onChange={set('sucursal')}
            />
          </Field>
          <Field label="CUIT / CUIL del emisor">
            <input
              className={inputCls}
              placeholder="CUIT/CUIL"
              value={val('cuitCuil')}
              onChange={set('cuitCuil')}
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nombre del titular del cheque">
            <input
              className={inputCls}
              placeholder="Nombre"
              value={val('titular')}
              onChange={set('titular')}
            />
          </Field>
          <Field label="Importe del cheque">
            <input
              className={inputCls}
              inputMode="decimal"
              placeholder="0,00"
              value={val('importe')}
              onChange={set('importe')}
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Tipo de cheque">
            <select className={inputCls} value={val('tipoCheque')} onChange={set('tipoCheque')}>
              <option value="">Seleccione una opción...</option>
              <option value="al_dia">Al día</option>
              <option value="diferido">Diferido</option>
            </select>
          </Field>
          <Field label="Moneda">
            <select className={inputCls} value={val('moneda')} onChange={set('moneda')}>
              <option value="">Seleccione una opción...</option>
              <option value="pesos">Pesos</option>
              <option value="dolares">Dólares</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Cuenta donde se deposita">
            <input
              className={inputCls}
              placeholder="Cuenta"
              value={val('cuenta')}
              onChange={set('cuenta')}
            />
          </Field>
          <Field label="Observaciones">
            <input
              className={inputCls}
              placeholder="Observaciones"
              value={val('observaciones')}
              onChange={set('observaciones')}
            />
          </Field>
        </div>
      </>
    );
  }

  if (formaDePago === 'mercado_pago') {
    return (
      <>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nombre / Email del pagador">
            <input
              className={inputCls}
              placeholder="Nombre o email"
              value={val('pagador')}
              onChange={set('pagador')}
            />
          </Field>
          <Field label="Nro. de operación">
            <input
              className={inputCls}
              placeholder="Número"
              value={val('nroOperacion')}
              onChange={set('nroOperacion')}
            />
          </Field>
        </div>
        <Field label="Importe">
          <input
            className={inputCls}
            inputMode="decimal"
            placeholder="0,00"
            value={val('importe')}
            onChange={set('importe')}
          />
        </Field>
      </>
    );
  }

  return null;
}
