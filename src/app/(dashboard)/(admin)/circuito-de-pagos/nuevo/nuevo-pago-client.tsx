'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { crearPagoAction, cuentaCorrienteProveedorAction } from '@/app/actions/pagos-proveedores';
import {
  Campo,
  Selector,
  Tarjeta,
  botonPrimario,
  botonSecundario,
  inputCls,
  textareaCls,
} from '@/components/shared/form-ui';
import { ProveedorSelect } from '@/components/shared/proveedor-selector';
import { parseImporte } from '@/lib/cuentas-a-pagar/calculos';
import {
  MONEDAS_CP,
  claseEstadoCp,
  formatoImporte,
  formatoMoneda,
  redondear,
} from '@/lib/cuentas-a-pagar/constantes';
import type { ProveedorSelector } from '@/lib/cuentas-a-pagar/consultas';
import { fechaLegible } from '@/lib/documentacion-fechas';
import type { FilaCuentaCorriente } from '@/lib/pagos/consultas';
import { CAMPOS_MEDIO, MEDIOS_PAGO, type MedioPago } from '@/lib/pagos/medios';

type LineaForm = { sel: boolean; monto: string; descuento: string };
type MedioForm = { medio: MedioPago; monto: string; datos: Record<string, string> };

const txt = (n: number): string => String(redondear(n)).replace('.', ',');

export function NuevoPagoClient({
  proveedores,
  hoy,
}: {
  proveedores: ProveedorSelector[];
  hoy: string;
}) {
  const router = useRouter();
  const [tipo, setTipo] = useState<'comprobantes' | 'anticipo'>('comprobantes');
  const [proveedorId, setProveedorId] = useState('');
  const [moneda, setMoneda] = useState('PES');
  const [tipoCambio, setTipoCambio] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [cuenta, setCuenta] = useState<FilaCuentaCorriente[]>([]);
  const [cargando, setCargando] = useState(false);
  const [lineas, setLineas] = useState<Record<string, LineaForm>>({});
  const [medios, setMedios] = useState<MedioForm[]>([
    { medio: 'transferencia', monto: '', datos: {} },
  ]);
  const [guardando, setGuardando] = useState(false);

  const proveedor = proveedores.find((p) => p.id === proveedorId) ?? null;
  const dolares = moneda === 'DOL';

  // Cuenta corriente del proveedor en la moneda del pago: se vuelve a pedir cada vez que
  // cambia el tipo de pago, el proveedor o la moneda (y se descarta la selección anterior).
  const pedido = useRef(0);
  function cargarCuenta(t: 'comprobantes' | 'anticipo', prov: string, mon: string) {
    const mio = ++pedido.current;
    setLineas({});
    setCuenta([]);
    if (t !== 'comprobantes' || !prov) {
      setCargando(false);
      return;
    }
    setCargando(true);
    cuentaCorrienteProveedorAction(prov, mon)
      .then((r) => {
        if (mio !== pedido.current) return;
        if (r.error) toast.error(r.error);
        else setCuenta(r.filas ?? []);
      })
      .finally(() => {
        if (mio === pedido.current) setCargando(false);
      });
  }

  function elegirTipo(t: 'comprobantes' | 'anticipo') {
    setTipo(t);
    cargarCuenta(t, proveedorId, moneda);
  }

  function elegirMoneda(m: string) {
    setMoneda(m);
    cargarCuenta(tipo, proveedorId, m);
  }

  function elegirProveedor(p: ProveedorSelector | null) {
    const nuevaMoneda = p ? (p.moneda === 'USD' ? 'DOL' : 'PES') : moneda;
    setProveedorId(p?.id ?? '');
    setMoneda(nuevaMoneda);
    cargarCuenta(tipo, p?.id ?? '', nuevaMoneda);
  }

  function alternarLinea(f: FilaCuentaCorriente) {
    setLineas((ls) => {
      const actual = ls[f.id];
      if (actual?.sel) return { ...ls, [f.id]: { ...actual, sel: false } };
      return { ...ls, [f.id]: { sel: true, monto: txt(f.saldo), descuento: '' } };
    });
  }

  function cambiarLinea(id: string, cambios: Partial<LineaForm>) {
    setLineas((ls) => ({ ...ls, [id]: { ...ls[id], ...cambios } }));
  }

  // Totales del pago.
  const calculo = useMemo(() => {
    let facturas = 0;
    let creditos = 0;
    let descuentos = 0;
    for (const f of cuenta) {
      const l = lineas[f.id];
      if (!l?.sel) continue;
      const monto = parseImporte(l.monto);
      if (f.signo === 1) {
        facturas += monto;
        descuentos += parseImporte(l.descuento);
      } else creditos += monto;
    }
    const aPagar = redondear(facturas - descuentos - creditos);
    const totalMedios = redondear(medios.reduce((s, m) => s + parseImporte(m.monto), 0));
    return {
      facturas: redondear(facturas),
      creditos: redondear(creditos),
      descuentos: redondear(descuentos),
      aPagar: tipo === 'anticipo' ? totalMedios : aPagar,
      totalMedios,
    };
  }, [cuenta, lineas, medios, tipo]);

  const seleccionadas = cuenta.filter((f) => lineas[f.id]?.sel);
  const diferencia = redondear(calculo.aPagar - calculo.totalMedios);

  function cambiarMedio(i: number, cambios: Partial<MedioForm>) {
    setMedios((ms) => ms.map((m, k) => (k === i ? { ...m, ...cambios } : m)));
  }

  function elegirMedioDePago(i: number, medio: MedioPago) {
    // Al cambiar el medio se descartan los datos del anterior.
    cambiarMedio(i, { medio, datos: {} });
  }

  function completarMonto(i: number) {
    const otros = medios.reduce((s, m, k) => (k === i ? s : s + parseImporte(m.monto)), 0);
    const resta = redondear(calculo.aPagar - otros);
    if (resta > 0) cambiarMedio(i, { monto: txt(resta) });
  }

  const sinMedios = tipo === 'comprobantes' && seleccionadas.length > 0 && calculo.aPagar === 0;
  const puedeGuardar =
    !!proveedorId &&
    !guardando &&
    (tipo === 'anticipo'
      ? calculo.totalMedios > 0
      : seleccionadas.length > 0 &&
        calculo.aPagar >= 0 &&
        (sinMedios ? calculo.totalMedios === 0 : diferencia === 0));

  async function registrar() {
    const payload = {
      proveedorId,
      tipo,
      moneda: dolares ? ('DOL' as const) : ('PES' as const),
      tipoCambio: dolares ? parseImporte(tipoCambio) || null : null,
      observaciones,
      lineas:
        tipo === 'comprobantes'
          ? seleccionadas.map((f) => ({
              comprobanteId: f.id,
              monto: parseImporte(lineas[f.id].monto),
              descuento: f.signo === 1 ? parseImporte(lineas[f.id].descuento) : 0,
            }))
          : [],
      medios: medios
        .filter((m) => parseImporte(m.monto) > 0)
        .map((m) => ({ medio: m.medio, monto: parseImporte(m.monto), datos: m.datos })),
    };
    setGuardando(true);
    try {
      const res = await crearPagoAction(payload);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`Pago registrado. Orden de pago ${res.codigo}.`);
      router.push(`/circuito-de-pagos/${res.id}`);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-6">
      <Tarjeta titulo="Cabecera del pago">
        <div className="space-y-4">
          <div className="flex gap-2">
            {(
              [
                ['comprobantes', 'Pagar comprobantes'],
                ['anticipo', 'Anticipo a proveedor'],
              ] as const
            ).map(([v, l]) => (
              <button
                key={v}
                type="button"
                onClick={() => elegirTipo(v)}
                className={`rounded-[10px] border px-4 py-2 text-sm font-medium ${
                  tipo === v
                    ? 'border-[#175861] bg-[#D9EBE9] text-[#175861]'
                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          {tipo === 'anticipo' && (
            <p className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800">
              Un anticipo es un pago sin comprobantes previos. Queda como saldo a favor del
              proveedor (se ve negativo en Cuentas a pagar) y se puede aplicar después a
              comprobantes a pagar, sin ser obligatorio.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Campo label="Fecha de emisión" ayuda="Es automática: la fecha de hoy.">
              <input type="date" className={inputCls} value={hoy} disabled readOnly />
            </Campo>
            <Campo label="Nro. de proveedor" requerido className="lg:col-span-2">
              <ProveedorSelect
                proveedores={proveedores}
                value={proveedorId}
                onChange={elegirProveedor}
              />
            </Campo>
            <Campo label="Moneda" requerido>
              <Selector value={moneda} onChange={elegirMoneda} opciones={MONEDAS_CP} />
            </Campo>
            {dolares && (
              <Campo label="Tipo de cambio" requerido>
                <input
                  className={inputCls}
                  inputMode="decimal"
                  placeholder="0,00"
                  value={tipoCambio}
                  onChange={(e) => setTipoCambio(e.target.value)}
                />
              </Campo>
            )}
          </div>
          {proveedor && (
            <p className="text-sm text-gray-500">
              {proveedor.nombre}
              {proveedor.cuit ? ` · CUIT ${proveedor.cuit}` : ''}
            </p>
          )}
        </div>
      </Tarjeta>

      {tipo === 'comprobantes' && (
        <Tarjeta
          titulo="Comprobantes a cancelar"
          descripcion="Cuenta corriente del proveedor. Solo se pueden pagar los comprobantes en estado A; las notas de crédito y los anticipos se compensan contra las facturas y notas de débito."
        >
          {!proveedorId ? (
            <p className="text-sm text-gray-500">Elegí un proveedor para ver sus comprobantes.</p>
          ) : cargando ? (
            <p className="text-sm text-gray-500">Cargando la cuenta corriente…</p>
          ) : cuenta.length === 0 ? (
            <p className="text-sm text-gray-500">
              Este proveedor no tiene comprobantes con saldo en {dolares ? 'dólares' : 'pesos'}.
            </p>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs tracking-wide text-gray-500 uppercase">
                      <th className="px-2 py-2" />
                      <th className="px-2 py-2 font-semibold">Comprobante</th>
                      <th className="px-2 py-2 font-semibold">Vence</th>
                      <th className="px-2 py-2 font-semibold">Estado</th>
                      <th className="px-2 py-2 text-right font-semibold">Monto original</th>
                      <th className="px-2 py-2 text-right font-semibold">Saldo pendiente</th>
                      <th className="px-2 py-2 font-semibold">Monto a aplicar</th>
                      <th className="px-2 py-2 font-semibold">Descuento / ajuste</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cuenta.map((f) => {
                      const bloqueado = f.estado !== 'A';
                      const l = lineas[f.id];
                      return (
                        <tr
                          key={f.id}
                          className={`border-b border-gray-100 ${bloqueado ? 'bg-gray-50 text-gray-400' : ''}`}
                        >
                          <td className="px-2 py-2">
                            <input
                              type="checkbox"
                              aria-label={`Seleccionar ${f.codigo}`}
                              disabled={bloqueado}
                              checked={!!l?.sel}
                              onChange={() => alternarLinea(f)}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <p className="font-medium">
                              {f.origen === 'anticipo' ? 'Anticipo' : f.tipoLabel}{' '}
                              {f.origen === 'anticipo' ? '' : f.numeroCompleto}
                            </p>
                            <p className="text-xs text-gray-500">{f.codigo}</p>
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap">
                            {f.fechaVencimiento ? fechaLegible(f.fechaVencimiento) : '—'}
                          </td>
                          <td className="px-2 py-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${claseEstadoCp(f.estado)}`}
                            >
                              {f.estado}
                            </span>
                            {bloqueado && (
                              <p className="mt-0.5 text-[11px] leading-tight">
                                Pasalo a A en Cuentas a pagar
                              </p>
                            )}
                          </td>
                          <td className="px-2 py-2 text-right whitespace-nowrap">
                            {formatoMoneda(f.signo * f.totalOriginal, f.moneda)}
                          </td>
                          <td className="px-2 py-2 text-right font-medium whitespace-nowrap">
                            {formatoMoneda(f.signo * f.saldo, f.moneda)}
                          </td>
                          <td className="px-2 py-2">
                            <input
                              className={`${inputCls} !w-32`}
                              inputMode="decimal"
                              aria-label="Monto a aplicar"
                              disabled={!l?.sel}
                              value={l?.sel ? l.monto : ''}
                              onChange={(e) => cambiarLinea(f.id, { monto: e.target.value })}
                            />
                          </td>
                          <td className="px-2 py-2">
                            {f.signo === 1 ? (
                              <input
                                className={`${inputCls} !w-28`}
                                inputMode="decimal"
                                placeholder="0,00"
                                aria-label="Descuento o ajuste"
                                disabled={!l?.sel}
                                value={l?.sel ? l.descuento : ''}
                                onChange={(e) => cambiarLinea(f.id, { descuento: e.target.value })}
                              />
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="space-y-3 md:hidden">
                {cuenta.map((f) => {
                  const bloqueado = f.estado !== 'A';
                  const l = lineas[f.id];
                  return (
                    <div
                      key={f.id}
                      className={`rounded-xl border p-3 ${
                        bloqueado ? 'border-gray-100 bg-gray-50 text-gray-400' : 'border-gray-200'
                      }`}
                    >
                      <label className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          className="mt-1"
                          aria-label={`Seleccionar ${f.codigo}`}
                          disabled={bloqueado}
                          checked={!!l?.sel}
                          onChange={() => alternarLinea(f)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium break-words">
                            {f.origen === 'anticipo'
                              ? 'Anticipo'
                              : `${f.tipoLabel} ${f.numeroCompleto}`}
                          </span>
                          <span className="block text-xs text-gray-500">
                            {f.codigo} · Vence{' '}
                            {f.fechaVencimiento ? fechaLegible(f.fechaVencimiento) : '—'}
                          </span>
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${claseEstadoCp(f.estado)}`}
                        >
                          {f.estado}
                        </span>
                      </label>
                      {bloqueado && (
                        <p className="mt-1 text-[11px] leading-tight">
                          Pasalo a A en Cuentas a pagar
                        </p>
                      )}
                      <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <dt className="text-gray-500">Monto original</dt>
                          <dd className="font-medium">
                            {formatoMoneda(f.signo * f.totalOriginal, f.moneda)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-gray-500">Saldo pendiente</dt>
                          <dd className="font-medium">
                            {formatoMoneda(f.signo * f.saldo, f.moneda)}
                          </dd>
                        </div>
                      </dl>
                      {l?.sel && (
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <label className="block text-xs font-medium text-gray-600">
                            Monto a aplicar
                            <input
                              className={`${inputCls} mt-1`}
                              inputMode="decimal"
                              value={l.monto}
                              onChange={(e) => cambiarLinea(f.id, { monto: e.target.value })}
                            />
                          </label>
                          {f.signo === 1 && (
                            <label className="block text-xs font-medium text-gray-600">
                              Descuento / ajuste
                              <input
                                className={`${inputCls} mt-1`}
                                inputMode="decimal"
                                placeholder="0,00"
                                value={l.descuento}
                                onChange={(e) => cambiarLinea(f.id, { descuento: e.target.value })}
                              />
                            </label>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Descuento / ajuste: un valor positivo es un descuento (se paga menos); uno negativo
                es un recargo o diferencia de cambio (se paga más). Se puede pagar un comprobante en
                forma parcial cambiando el monto a aplicar.
              </p>
            </>
          )}
        </Tarjeta>
      )}

      <Tarjeta
        titulo="Medios de pago"
        descripcion="Se puede pagar con uno o varios medios a la vez; la suma tiene que coincidir con el total a pagar."
      >
        <div className="space-y-4">
          {sinMedios && (
            <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">
              Los comprobantes elegidos se compensan entre sí por completo: no hace falta ningún
              medio de pago.
            </p>
          )}
          {!sinMedios &&
            medios.map((m, i) => (
              <div key={i} className="rounded-xl border border-gray-200 p-4">
                <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
                  <Campo label="Medio de pago" requerido>
                    <select
                      className={inputCls}
                      value={m.medio}
                      onChange={(e) => elegirMedioDePago(i, e.target.value as MedioPago)}
                    >
                      {MEDIOS_PAGO.map((x) => (
                        <option key={x.value} value={x.value}>
                          {x.label}
                        </option>
                      ))}
                    </select>
                  </Campo>
                  <Campo label="Monto" requerido>
                    <div className="flex gap-2">
                      <input
                        className={inputCls}
                        inputMode="decimal"
                        placeholder="0,00"
                        value={m.monto}
                        onChange={(e) => cambiarMedio(i, { monto: e.target.value })}
                      />
                      <button
                        type="button"
                        className={`${botonSecundario} whitespace-nowrap`}
                        onClick={() => completarMonto(i)}
                        title="Completar con lo que falta pagar"
                      >
                        Lo que falta
                      </button>
                    </div>
                  </Campo>
                  <button
                    type="button"
                    aria-label="Quitar medio de pago"
                    className="h-10 justify-self-end rounded-md p-2 text-gray-400 hover:bg-gray-100 disabled:opacity-40"
                    disabled={medios.length === 1}
                    onClick={() => setMedios((ms) => ms.filter((_, k) => k !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {CAMPOS_MEDIO[m.medio].length > 0 && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {CAMPOS_MEDIO[m.medio].map((c) => (
                      <Campo key={c.key} label={c.label} requerido={c.requerido}>
                        {c.key === 'cbuAlias' &&
                        proveedor &&
                        proveedor.cuentasBancarias.length > 0 ? (
                          <div className="space-y-1">
                            <select
                              className={inputCls}
                              value=""
                              onChange={(e) =>
                                e.target.value &&
                                cambiarMedio(i, { datos: { ...m.datos, [c.key]: e.target.value } })
                              }
                            >
                              <option value="">Elegir una cuenta del proveedor</option>
                              {proveedor.cuentasBancarias.map((cb, k) => {
                                const v = cb.cbu || cb.alias || '';
                                return v ? (
                                  <option key={k} value={v}>
                                    {[cb.banco, cb.alias, cb.cbu].filter(Boolean).join(' · ')}
                                  </option>
                                ) : null;
                              })}
                            </select>
                            <input
                              className={inputCls}
                              placeholder={c.placeholder}
                              value={m.datos[c.key] ?? ''}
                              onChange={(e) =>
                                cambiarMedio(i, { datos: { ...m.datos, [c.key]: e.target.value } })
                              }
                            />
                          </div>
                        ) : (
                          <input
                            type={c.tipo === 'date' ? 'date' : 'text'}
                            inputMode={c.tipo === 'decimal' ? 'decimal' : undefined}
                            className={inputCls}
                            placeholder={c.placeholder}
                            value={m.datos[c.key] ?? ''}
                            onChange={(e) =>
                              cambiarMedio(i, { datos: { ...m.datos, [c.key]: e.target.value } })
                            }
                          />
                        )}
                      </Campo>
                    ))}
                  </div>
                )}
              </div>
            ))}
          {!sinMedios && medios.length < 10 && (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-sm font-medium text-[#175861] hover:underline"
              onClick={() =>
                setMedios((ms) => [...ms, { medio: 'transferencia', monto: '', datos: {} }])
              }
            >
              <Plus className="h-4 w-4" />
              Agregar otro medio de pago
            </button>
          )}
        </div>
      </Tarjeta>

      <Tarjeta titulo="Resumen">
        <div className="grid gap-6 lg:grid-cols-2">
          <dl className="space-y-1 text-sm">
            {tipo === 'comprobantes' && (
              <>
                <Fila r="Facturas y notas de débito" v={formatoImporte(calculo.facturas)} />
                <Fila
                  r="Notas de crédito y anticipos aplicados"
                  v={`- ${formatoImporte(calculo.creditos)}`}
                />
                <Fila r="Descuentos / ajustes" v={`- ${formatoImporte(calculo.descuentos)}`} />
              </>
            )}
            <div className="flex justify-between gap-4 border-t border-gray-200 pt-2 text-base font-bold text-gray-900">
              <dt>Total a pagar</dt>
              <dd>{formatoMoneda(calculo.aPagar, moneda)}</dd>
            </div>
            <Fila r="Suma de los medios de pago" v={formatoImporte(calculo.totalMedios)} />
            {tipo === 'comprobantes' && !sinMedios && diferencia !== 0 && (
              <p className="pt-1 text-sm font-medium text-red-600">
                {diferencia > 0
                  ? `Faltan ${formatoImporte(diferencia)} por cubrir con medios de pago.`
                  : `Los medios de pago superan el total en ${formatoImporte(-diferencia)}.`}
              </p>
            )}
            {tipo === 'comprobantes' && calculo.aPagar < 0 && (
              <p className="pt-1 text-sm font-medium text-red-600">
                Las notas de crédito y los anticipos superan a las facturas: sumá una factura o
                aplicá menos.
              </p>
            )}
          </dl>
          <Campo label="Observaciones">
            <textarea
              className={textareaCls}
              maxLength={500}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
            />
          </Campo>
        </div>
      </Tarjeta>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          className={botonSecundario}
          disabled={guardando}
          onClick={() => router.push('/circuito-de-pagos')}
        >
          Cancelar
        </button>
        <button
          type="button"
          className={botonPrimario}
          disabled={!puedeGuardar}
          onClick={registrar}
        >
          {guardando ? 'Registrando…' : 'Registrar pago'}
        </button>
      </div>
    </div>
  );
}

function Fila({ r, v }: { r: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-gray-500">{r}</dt>
      <dd className="font-medium text-gray-900">{v}</dd>
    </div>
  );
}
