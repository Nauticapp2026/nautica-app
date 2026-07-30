'use client';

import { Plus, Trash2 } from 'lucide-react';

import { Field, inputCls, sanitizeMontoInput } from '@/components/shared/forma-pago';

// Una línea de forma de pago dentro de una cobranza. `monto` siempre en pesos
// (para dólares se deriva de usd * tc). `datos` lleva los campos propios del tipo.
export type FormaCobranza = {
  id: string;
  tipo: string;
  monto: string;
  datos: Record<string, string>;
};

export type TarjetaGuardada = { marca: string; lastFour: string } | null;

export const TIPOS_COBRANZA = [
  { value: 'efectivo', label: 'Efectivo (pesos)' },
  { value: 'efectivo_usd', label: 'Efectivo (dólares)' },
  { value: 'tarjeta_credito', label: 'Tarjeta de crédito' },
  { value: 'tarjeta_debito', label: 'Tarjeta de débito' },
  { value: 'transferencia', label: 'Transferencia bancaria' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'mercado_pago', label: 'Mercado Pago' },
  { value: 'otro', label: 'Otro' },
] as const;

function todayISODate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function num(v: string | undefined): number {
  return parseFloat((v ?? '').replace(',', '.')) || 0;
}

// Tipos de cobranza visibles según los medios habilitados por el club para
// comprobantes internos (Configuración de cobranzas). null = sin restricción
// (canal fiscal). 'efectivo_usd' cuenta como 'efectivo'; 'otro' no es un
// medio configurable y se excluye cuando hay restricción.
export function tiposCobranzaPermitidos(permitidos: string[] | null) {
  if (!permitidos) return [...TIPOS_COBRANZA];
  return TIPOS_COBRANZA.filter((o) =>
    permitidos.includes(o.value === 'efectivo_usd' ? 'efectivo' : o.value),
  );
}

export function nuevaForma(tiposPermitidos: string[] | null = null): FormaCobranza {
  const tipos = tiposCobranzaPermitidos(tiposPermitidos);
  return { id: crypto.randomUUID(), tipo: tipos[0]?.value ?? 'efectivo', monto: '', datos: {} };
}

export function FormasDePago({
  formas,
  setFormas,
  montoAPagar,
  tarjetaGuardada,
  tiposPermitidos = null,
}: {
  formas: FormaCobranza[];
  setFormas: React.Dispatch<React.SetStateAction<FormaCobranza[]>>;
  montoAPagar: string;
  tarjetaGuardada: TarjetaGuardada;
  tiposPermitidos?: string[] | null;
}) {
  const tipos = tiposCobranzaPermitidos(tiposPermitidos);
  if (tipos.length === 0) {
    return (
      <p className="rounded-[10px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Ninguno de los medios habilitados para comprobantes internos permite un cobro manual. Revisá
        la Configuración de cobranzas en Mi Perfil → Datos Impositivos.
      </p>
    );
  }
  function update(id: string, patch: Partial<FormaCobranza>) {
    setFormas((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }
  function remove(id: string) {
    setFormas((prev) => {
      const next = prev.filter((f) => f.id !== id);
      // Si queda una sola forma, la re-sincroniza con el monto a pagar — si
      // se estaba partiendo el pago, la que sobrevive puede haber quedado
      // con un importe parcial que ya no corresponde.
      return next.length === 1 ? [{ ...next[0], monto: montoAPagar }] : next;
    });
  }

  return (
    <div className="space-y-3">
      {formas.map((forma) => (
        <Linea
          key={forma.id}
          forma={forma}
          canRemove={formas.length > 1}
          soloUnaForma={formas.length === 1}
          tarjetaGuardada={tarjetaGuardada}
          tipos={tipos}
          onChange={(patch) => update(forma.id, patch)}
          onRemove={() => remove(forma.id)}
        />
      ))}
      <button
        type="button"
        onClick={() => setFormas((prev) => [...prev, nuevaForma(tiposPermitidos)])}
        className="inline-flex items-center gap-1.5 rounded-[10px] border border-dashed border-gray-300 px-3 py-2 text-sm font-medium text-[#175861] transition hover:bg-gray-50"
      >
        <Plus className="h-4 w-4" />
        Agregar forma de pago
      </button>
    </div>
  );
}

function Linea({
  forma,
  canRemove,
  soloUnaForma,
  tarjetaGuardada,
  tipos,
  onChange,
  onRemove,
}: {
  forma: FormaCobranza;
  canRemove: boolean;
  soloUnaForma: boolean;
  tarjetaGuardada: TarjetaGuardada;
  tipos: { value: string; label: string }[];
  onChange: (patch: Partial<FormaCobranza>) => void;
  onRemove: () => void;
}) {
  const d = forma.datos;
  const setDato = (k: string, v: string) => onChange({ datos: { ...d, [k]: v } });
  // Merge de varios campos en una sola actualización (evita pisarse entre setDato).
  const setDatos = (patch: Record<string, string>) => onChange({ datos: { ...d, ...patch } });

  // Para dólares el monto en pesos se deriva de usd * tc.
  function setUsd(usd: string, tc: string) {
    const pesos = num(usd) * num(tc);
    onChange({ datos: { ...d, usd, tc }, monto: pesos ? pesos.toFixed(2) : '' });
  }

  function changeTipo(tipo: string) {
    // Default de algunos campos al cambiar de tipo. Con una sola forma el
    // monto sigue al "Monto a pagar" (no se resetea); con varias, al cambiar
    // el tipo de una línea el importe se vuelve a completar a mano.
    const datos: Record<string, string> = {};
    if (tipo === 'transferencia') datos.fecha = todayISODate();
    onChange({ tipo, datos, monto: soloUnaForma ? forma.monto : '' });
  }

  return (
    <div className="rounded-[12px] border border-gray-200 p-3">
      {canRemove && (
        <div className="mb-2 flex items-center justify-end">
          <button
            type="button"
            onClick={onRemove}
            className="rounded p-1 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="space-y-3">
        <Field label="Forma de pago">
          <select
            className={inputCls}
            value={forma.tipo}
            onChange={(e) => changeTipo(e.target.value)}
          >
            {tipos.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        {/* Dólares: usd + tc → pesos */}
        {forma.tipo === 'efectivo_usd' ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Monto USD">
                <input
                  className={inputCls}
                  inputMode="decimal"
                  placeholder="0,00"
                  value={d.usd ?? ''}
                  onChange={(e) => setUsd(sanitizeMontoInput(e.target.value), d.tc ?? '')}
                />
              </Field>
              <Field label="Tipo de cambio">
                <input
                  className={inputCls}
                  inputMode="decimal"
                  placeholder="0,00"
                  value={d.tc ?? ''}
                  onChange={(e) => setUsd(d.usd ?? '', sanitizeMontoInput(e.target.value))}
                />
              </Field>
            </div>
            <div className="rounded-[8px] bg-gray-50 px-3 py-2 text-sm text-gray-600">
              Equivale a{' '}
              <span className="font-semibold text-[#101828]">
                ${num(forma.monto).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </>
        ) : (
          <CamposPorTipo
            forma={forma}
            setDato={setDato}
            setDatos={setDatos}
            tarjetaGuardada={tarjetaGuardada}
          />
        )}

        {/* Monto en pesos (no para dólares, que es derivado). Con una sola
            forma de pago, sigue automáticamente al "Monto a cobrar" de
            arriba — no tiene sentido pedirle al admin que escriba el mismo
            número dos veces (y era la causa de que un pago parcial pareciera
            bloqueado: bastaba con que este campo no se actualizara solo). */}
        {forma.tipo !== 'efectivo_usd' &&
          (soloUnaForma ? (
            <Field label="Importe (pesos)">
              <input
                className={`${inputCls} bg-gray-50 text-gray-500`}
                value={forma.monto}
                disabled
                title="Sigue al Monto a cobrar de arriba"
              />
            </Field>
          ) : (
            <Field label="Importe (pesos)">
              <input
                className={inputCls}
                inputMode="decimal"
                placeholder="0,00"
                value={forma.monto}
                onChange={(e) => onChange({ monto: sanitizeMontoInput(e.target.value) })}
              />
            </Field>
          ))}
      </div>
    </div>
  );
}

function CamposPorTipo({
  forma,
  setDato,
  setDatos,
  tarjetaGuardada,
}: {
  forma: FormaCobranza;
  setDato: (k: string, v: string) => void;
  setDatos: (patch: Record<string, string>) => void;
  tarjetaGuardada: TarjetaGuardada;
}) {
  const d = forma.datos;
  const val = (k: string) => d[k] ?? '';

  if (forma.tipo === 'tarjeta_credito' || forma.tipo === 'tarjeta_debito') {
    const usarGuardada = d.usarGuardada === '1';
    return (
      <>
        {tarjetaGuardada && (
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#175861]"
              checked={usarGuardada}
              onChange={(e) => {
                if (e.target.checked) {
                  setDatos({
                    usarGuardada: '1',
                    tarjeta: tarjetaGuardada.marca,
                    ultimos4: tarjetaGuardada.lastFour,
                  });
                } else {
                  setDato('usarGuardada', '');
                }
              }}
            />
            Usar la tarjeta que tiene cargada ({tarjetaGuardada.marca} ••{tarjetaGuardada.lastFour})
          </label>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tarjeta">
            <input
              className={inputCls}
              placeholder="Visa, Mastercard…"
              value={val('tarjeta')}
              onChange={(e) => setDato('tarjeta', e.target.value)}
              disabled={usarGuardada}
            />
          </Field>
          <Field label="Banco">
            <input
              className={inputCls}
              placeholder="Banco"
              value={val('banco')}
              onChange={(e) => setDato('banco', e.target.value)}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Últimos 4 dígitos">
            <input
              className={inputCls}
              placeholder="1234"
              maxLength={4}
              value={val('ultimos4')}
              onChange={(e) => setDato('ultimos4', e.target.value)}
              disabled={usarGuardada}
            />
          </Field>
          {forma.tipo === 'tarjeta_credito' && (
            <Field label="Cuotas">
              <select
                className={inputCls}
                value={val('cuotas')}
                onChange={(e) => setDato('cuotas', e.target.value)}
              >
                <option value="">Seleccione...</option>
                {[1, 2, 3, 6, 9, 12, 18, 24].map((n) => (
                  <option key={n} value={String(n)}>
                    {n === 1 ? 'Contado' : `${n} cuotas`}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
        <Field label="Nº de transacción">
          <input
            className={inputCls}
            placeholder="Número"
            value={val('nroTransaccion')}
            onChange={(e) => setDato('nroTransaccion', e.target.value)}
          />
        </Field>
      </>
    );
  }

  if (forma.tipo === 'transferencia') {
    return (
      <>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Banco origen">
            <input
              className={inputCls}
              placeholder="Banco"
              value={val('banco')}
              onChange={(e) => setDato('banco', e.target.value)}
            />
          </Field>
          <Field label="Nombre del titular">
            <input
              className={inputCls}
              placeholder="Nombre"
              value={val('titular')}
              onChange={(e) => setDato('titular', e.target.value)}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha de transferencia">
            <input
              type="date"
              className={inputCls}
              value={val('fecha')}
              onChange={(e) => setDato('fecha', e.target.value)}
            />
          </Field>
          <Field label="Nº de operación / ref.">
            <input
              className={inputCls}
              placeholder="Número"
              value={val('nroOperacion')}
              onChange={(e) => setDato('nroOperacion', e.target.value)}
            />
          </Field>
        </div>
        <Field label="Observaciones">
          <input
            className={inputCls}
            placeholder="Observaciones"
            value={val('observaciones')}
            onChange={(e) => setDato('observaciones', e.target.value)}
          />
        </Field>
      </>
    );
  }

  if (forma.tipo === 'cheque') {
    return (
      <>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Número de cheque">
            <input
              className={inputCls}
              placeholder="Número"
              value={val('numeroCheque')}
              onChange={(e) => setDato('numeroCheque', e.target.value)}
            />
          </Field>
          <Field label="Banco emisor">
            <input
              className={inputCls}
              placeholder="Banco"
              value={val('banco')}
              onChange={(e) => setDato('banco', e.target.value)}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre del titular">
            <input
              className={inputCls}
              placeholder="Nombre"
              value={val('titular')}
              onChange={(e) => setDato('titular', e.target.value)}
            />
          </Field>
          <Field label="Fecha de vencimiento">
            <input
              type="date"
              className={inputCls}
              value={val('fechaVencimiento')}
              onChange={(e) => setDato('fechaVencimiento', e.target.value)}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo de cheque">
            <select
              className={inputCls}
              value={val('tipoCheque')}
              onChange={(e) => setDato('tipoCheque', e.target.value)}
            >
              <option value="">Seleccione...</option>
              <option value="al_dia">Al día</option>
              <option value="diferido">Diferido</option>
            </select>
          </Field>
          <Field label="Moneda">
            <select
              className={inputCls}
              value={val('moneda')}
              onChange={(e) => setDato('moneda', e.target.value)}
            >
              <option value="">Seleccione...</option>
              <option value="pesos">Pesos</option>
              <option value="dolares">Dólares</option>
            </select>
          </Field>
        </div>
        <Field label="Observaciones">
          <input
            className={inputCls}
            placeholder="Observaciones"
            value={val('observaciones')}
            onChange={(e) => setDato('observaciones', e.target.value)}
          />
        </Field>
      </>
    );
  }

  if (forma.tipo === 'mercado_pago') {
    return (
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nombre / Email del pagador">
          <input
            className={inputCls}
            placeholder="Nombre o email"
            value={val('pagador')}
            onChange={(e) => setDato('pagador', e.target.value)}
          />
        </Field>
        <Field label="Nº de operación">
          <input
            className={inputCls}
            placeholder="Número"
            value={val('nroOperacion')}
            onChange={(e) => setDato('nroOperacion', e.target.value)}
          />
        </Field>
      </div>
    );
  }

  if (forma.tipo === 'otro') {
    return (
      <Field label="Observaciones">
        <input
          className={inputCls}
          placeholder="Detalle del pago"
          value={val('observaciones')}
          onChange={(e) => setDato('observaciones', e.target.value)}
        />
      </Field>
    );
  }

  // efectivo (pesos): sin campos extra
  return null;
}
