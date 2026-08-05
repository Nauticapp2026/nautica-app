'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Search, X } from 'lucide-react';

import {
  Field,
  inputCls,
  montoToNumberStr,
  sanitizeMontoInput,
} from '@/components/shared/forma-pago';
import { buscarSocios } from '@/lib/buscador';
import { formatArgentinaDate } from '@/lib/dates';
import {
  getComprobantesPendientesAction,
  registrarCobranzaAction,
  type ComprobantePendiente,
} from '@/app/actions/cobranzas';
import {
  FormasDePago,
  nuevaForma,
  tiposCobranzaPermitidos,
  type FormaCobranza,
  type TarjetaGuardada,
} from './cobranza-formas';

export type SocioOption = {
  id: string;
  nombre: string;
  numeroSocio: number | null;
  embarcaciones: string[];
};

const TIPO_COMPROBANTE_LABEL: Record<string, string> = {
  factura_a: 'Factura A',
  factura_b: 'Factura B',
  factura_c: 'Factura C',
  nota_debito_a: 'Nota de débito A',
  nota_debito_b: 'Nota de débito B',
  nota_debito_c: 'Nota de débito C',
  // Los pendientes de cobro con tipo 'recibo' son siempre CM-/CL-/CA- (un
  // RC- nunca queda pendiente): el documento se llama "Comprobante interno".
  recibo: 'Comprobante interno',
};

function fmtMoney(amount: number): string {
  return `$${amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
}

function todayISODate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function CobranzaClient({
  socios,
  mediosInternos,
}: {
  socios: SocioOption[];
  // Medios de pago habilitados para comprobantes internos (Configuración de
  // cobranzas en Mi Perfil). Vacío = la pata de internos no aparece.
  mediosInternos: string[];
}) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div>
      <button
        onClick={() => setModalOpen(true)}
        className="inline-flex items-center gap-2 rounded-[10px] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
        style={{ background: '#175861' }}
      >
        <Plus className="h-4 w-4" />
        Nueva cobranza
      </button>

      {modalOpen && (
        <NuevaCobranzaModal
          socios={socios}
          mediosInternos={mediosInternos}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}

type Step = 'socio' | 'comprobantes' | 'pago';

function NuevaCobranzaModal({
  socios,
  mediosInternos,
  onClose,
}: {
  socios: SocioOption[];
  mediosInternos: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('socio');
  const internosHabilitados = mediosInternos.length > 0;

  // Qué va a cobrar el club: comprobantes fiscales (ARCA) o internos. Misma
  // separación que las pestañas de Ventas — un recibo no puede mezclar los dos
  // circuitos, así que se elige de entrada y la lista no los muestra juntos.
  // Sin internos habilitados, el selector no aparece y solo se cobran ARCA.
  const [canal, setCanal] = useState<'fiscal' | 'interno'>('fiscal');

  // Paso socio
  const [query, setQuery] = useState('');
  const [socio, setSocio] = useState<SocioOption | null>(null);
  const [tarjetaGuardada, setTarjetaGuardada] = useState<TarjetaGuardada>(null);

  // Paso comprobantes
  const [comprobantes, setComprobantes] = useState<ComprobantePendiente[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingComps, setLoadingComps] = useState(false);

  // Paso pago
  const [fecha, setFecha] = useState(todayISODate);
  const [montoAPagar, setMontoAPagar] = useState('');
  // Reparto por comprobante: cuánto del pago va a cada uno. Solo se usa (y se
  // edita) cuando hay 2+ comprobantes tildados — así el club elige a qué
  // factura imputa el parcial en vez de que aplique del más viejo al más nuevo.
  const [montosPorComp, setMontosPorComp] = useState<Record<string, string>>({});
  const [formas, setFormas] = useState<FormaCobranza[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const sociosFiltrados = useMemo(() => buscarSocios(socios, query).slice(0, 50), [socios, query]);

  // Solo los comprobantes del canal elegido: interno = CM-/CL-/CA- (tipo
  // 'recibo'); fiscal = facturas A/B/C y notas de débito.
  const comprobantesCanal = useMemo(
    () => comprobantes.filter((c) => (c.tipoFactura === 'recibo') === (canal === 'interno')),
    [comprobantes, canal],
  );

  // Comprobantes tildados, en el orden en que se muestran (del más viejo al
  // más nuevo). Con 2+ se habilita el reparto manual por comprobante.
  const seleccionados = useMemo(
    () => comprobantesCanal.filter((c) => selected.has(c.id)),
    [comprobantesCanal, selected],
  );
  const modoReparto = seleccionados.length >= 2;

  // Lo seleccionado se suma por el saldo PENDIENTE de cada comprobante (si ya
  // tuvo un cobro parcial o una NC, se cobra solo lo que falta).
  const totalSeleccionado = useMemo(
    () =>
      seleccionados.reduce((acc, c) => acc + parseFloat(c.importePendiente ?? c.importe ?? '0'), 0),
    [seleccionados],
  );

  function pendienteDe(c: ComprobantePendiente): number {
    return parseFloat(c.importePendiente ?? c.importe ?? '0');
  }

  // Cobrando internos, el dropdown de formas solo muestra los medios que el
  // club habilitó en la Configuración de cobranzas. Fiscal: lista completa.
  const tiposPermitidos = canal === 'interno' ? mediosInternos : null;
  // Puede ser 0 si el club solo habilitó medios sin cobro manual (ej. solo
  // Débito automático): en ese caso Registrar queda deshabilitado (el aviso
  // lo muestra FormasDePago).
  const hayMediosManuales = tiposCobranzaPermitidos(tiposPermitidos).length > 0;

  const montoNum = parseFloat(montoToNumberStr(montoAPagar)) || 0;
  const totalCargado = useMemo(
    () => formas.reduce((acc, f) => acc + (parseFloat(montoToNumberStr(f.monto)) || 0), 0),
    [formas],
  );
  const cuadra = Math.abs(totalCargado - montoNum) < 0.01;
  // En modo reparto ningún comprobante puede recibir más de lo que debe (el
  // excedente no tiene dónde ir: un comprobante no se sobre-cobra).
  const repartoValido = useMemo(() => {
    if (!modoReparto) return true;
    return seleccionados.every((c) => {
      const monto = parseFloat(montoToNumberStr(montosPorComp[c.id] ?? '0')) || 0;
      return monto >= 0 && monto <= pendienteDe(c) + 0.01;
    });
  }, [modoReparto, seleccionados, montosPorComp]);
  const pagoValido =
    montoNum > 0 && cuadra && formas.length > 0 && hayMediosManuales && repartoValido;

  function handleSelectSocio(s: SocioOption) {
    setSocio(s);
    setError(null);
    setLoadingComps(true);
    setStep('comprobantes');
    startTransition(async () => {
      const res = await getComprobantesPendientesAction(s.id);
      setLoadingComps(false);
      if (res.error) {
        setError(res.error);
        setComprobantes([]);
        return;
      }
      setComprobantes(res.comprobantes ?? []);
      setTarjetaGuardada(res.tarjeta ?? null);
      setSelected(new Set());
    });
  }

  function toggleComprobante(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === comprobantesCanal.length
        ? new Set()
        : new Set(comprobantesCanal.map((c) => c.id)),
    );
  }

  function irAPago() {
    // Pre-llenar el monto a pagar con el total seleccionado, y la única forma
    // de pago con el mismo importe (se mantienen sincronizados mientras haya
    // una sola forma — ver `handleMontoAPagarChange`). Si el admin agrega más
    // formas para partir el pago, cada una se edita por separado.
    const inicial = totalSeleccionado > 0 ? totalSeleccionado.toFixed(2) : '';
    setMontoAPagar(inicial);
    // Reparto inicial: cada comprobante arranca con su saldo pendiente entero.
    const montos: Record<string, string> = {};
    for (const c of seleccionados) montos[c.id] = pendienteDe(c).toFixed(2);
    setMontosPorComp(montos);
    setFormas([{ ...nuevaForma(tiposPermitidos), monto: inicial }]);
    setError(null);
    setStep('pago');
  }

  function sincronizarConMonto(total: string) {
    // Con una sola forma de pago no tiene sentido pedirle al admin que
    // escriba el mismo importe dos veces — se sigue el monto a pagar
    // (incluye el caso de pago parcial: si lo baja, la forma lo acompaña).
    setFormas((prev) => (prev.length === 1 ? [{ ...prev[0], monto: total }] : prev));
  }

  function handleMontoAPagarChange(value: string) {
    const limpio = sanitizeMontoInput(value);
    setMontoAPagar(limpio);
    sincronizarConMonto(limpio);
  }

  function handleMontoCompChange(compId: string, value: string) {
    const limpio = sanitizeMontoInput(value);
    const next = { ...montosPorComp, [compId]: limpio };
    setMontosPorComp(next);
    // El monto a cobrar es la suma de lo asignado a cada comprobante.
    const suma = seleccionados.reduce(
      (acc, c) => acc + (parseFloat(montoToNumberStr(next[c.id] ?? '0')) || 0),
      0,
    );
    const totalStr = suma > 0 ? suma.toFixed(2) : '';
    setMontoAPagar(totalStr);
    sincronizarConMonto(totalStr);
  }

  function handleRegistrar() {
    if (!socio) return;
    setError(null);
    startTransition(async () => {
      const res = await registrarCobranzaAction({
        socioId: socio.id,
        comprobanteIds: [...selected],
        fecha,
        montoAPagar: montoToNumberStr(montoAPagar),
        formas: formas.map((f) => ({
          tipo: f.tipo,
          monto: montoToNumberStr(f.monto),
          datos: f.datos,
        })),
        canal,
        // Con 2+ comprobantes el club reparte a mano; con uno solo lo resuelve
        // el server (aplica todo al único comprobante).
        aplicaciones: modoReparto
          ? seleccionados.map((c) => ({
              comprobanteId: c.id,
              monto: montoToNumberStr(montosPorComp[c.id] ?? '0'),
            }))
          : undefined,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      toast.success('Cobranza registrada');
      onClose();
      router.refresh();
    });
  }

  return (
    <Overlay>
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <h2 className="text-[18px] font-bold" style={{ color: '#101828' }}>
              Nueva cobranza
            </h2>
            <p className="mt-0.5 text-sm" style={{ color: '#669E9D' }}>
              {step === 'socio' ? 'Elegí el socio a cobrar' : `Socio: ${socio?.nombre ?? ''}`}
            </p>
          </div>
          <button onClick={onClose} className="rounded-[8px] p-1 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="border-t border-gray-200" />

        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          {/* Paso 1: tipo de cobranza + elegir socio */}
          {step === 'socio' && (
            <>
              {/* Sin medios habilitados para internos (Configuración de
                  cobranzas), la opción no aparece: solo se cobran ARCA. */}
              {internosHabilitados && (
                <div>
                  <p className="mb-2 text-xs font-semibold" style={{ color: '#101828' }}>
                    ¿Qué tipo de comprobantes vas a cobrar?
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { value: 'fiscal', label: 'Comprobantes ARCA' },
                        { value: 'interno', label: 'Comprobantes internos' },
                      ] as const
                    ).map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => {
                          setCanal(o.value);
                          setSelected(new Set());
                        }}
                        className={`rounded-[10px] border px-3 py-2.5 text-sm font-medium transition ${
                          canal === o.value
                            ? 'border-[#175861] bg-[#EFF8F7] text-[#175861]'
                            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="relative">
                <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  autoFocus
                  className={`${inputCls} pl-9`}
                  placeholder="Buscar por nombre, nº de socio o embarcación…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <div className="max-h-[50vh] divide-y divide-gray-100 overflow-y-auto rounded-[10px] border border-gray-200">
                {sociosFiltrados.length === 0 ? (
                  <p className="p-4 text-center text-sm text-gray-400">Sin resultados.</p>
                ) : (
                  sociosFiltrados.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => handleSelectSocio(s)}
                      className="flex w-full flex-col items-start px-4 py-3 text-left transition hover:bg-gray-50"
                    >
                      <span className="text-sm font-medium text-[#101828]">{s.nombre}</span>
                      <span className="text-xs text-gray-400">
                        {s.numeroSocio != null ? `Socio #${s.numeroSocio}` : 'Sin nº'}
                        {s.embarcaciones.length > 0 ? ` · ${s.embarcaciones.join(', ')}` : ''}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </>
          )}

          {/* Paso 2: comprobantes */}
          {step === 'comprobantes' && (
            <>
              {loadingComps ? (
                <p className="py-8 text-center text-sm text-gray-400">Cargando comprobantes…</p>
              ) : comprobantesCanal.length === 0 ? (
                <div className="space-y-2 py-8 text-center">
                  <p className="text-sm text-gray-400">
                    Este socio no tiene comprobantes {canal === 'interno' ? 'internos' : 'ARCA'}{' '}
                    pendientes de cobro.
                  </p>
                  <p className="text-xs text-gray-400">
                    Podés continuar igual para registrar un adelanto: el monto queda como saldo a
                    favor en su cuenta corriente.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <button
                      onClick={toggleAll}
                      className="text-xs font-medium text-[#175861] hover:underline"
                    >
                      {selected.size === comprobantesCanal.length
                        ? 'Deseleccionar todos'
                        : 'Seleccionar todos'}
                    </button>
                    <span className="text-xs text-gray-400">
                      {selected.size} de {comprobantesCanal.length}
                    </span>
                  </div>
                  <div className="divide-y divide-gray-100 rounded-[10px] border border-gray-200">
                    {comprobantesCanal.map((c) => (
                      <label
                        key={c.id}
                        className="flex cursor-pointer items-center gap-3 px-4 py-3 transition hover:bg-gray-50"
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(c.id)}
                          onChange={() => toggleComprobante(c.id)}
                          className="h-4 w-4 accent-[#175861]"
                        />
                        <div className="flex flex-1 flex-col">
                          <span className="text-sm font-medium text-[#101828]">
                            {c.codigo ?? 'Sin código'}
                            <span className="ml-2 text-xs font-normal text-gray-400">
                              {TIPO_COMPROBANTE_LABEL[c.tipoFactura ?? ''] ?? c.tipoFactura}
                            </span>
                          </span>
                          <span className="text-xs text-gray-400">
                            {c.emision ? formatArgentinaDate(c.emision) : '—'}
                            {c.estado === 'vencida' ? ' · Vencida' : ''}
                            {c.cobradoParcial
                              ? ` · Cobro parcial — total ${fmtMoney(parseFloat(c.importe ?? '0'))}`
                              : ''}
                          </span>
                        </div>
                        {/* Se muestra (y se cobra) el saldo pendiente, no el total. */}
                        <span className="text-sm font-semibold text-[#101828]">
                          {fmtMoney(parseFloat(c.importePendiente ?? c.importe ?? '0'))}
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="flex items-center justify-between rounded-[10px] bg-gray-50 px-4 py-3">
                    <span className="text-sm font-medium text-gray-600">Total seleccionado</span>
                    <span className="text-[18px] font-bold text-[#101828]">
                      {fmtMoney(totalSeleccionado)}
                    </span>
                  </div>
                </>
              )}
            </>
          )}

          {/* Paso 3: pago */}
          {step === 'pago' && (
            <>
              {/* En modo reparto el detalle por comprobante ya muestra los
                  totales; el resumen de arriba sería redundante. */}
              {!modoReparto && (
                <div className="flex items-center justify-between rounded-[10px] bg-gray-50 px-4 py-3">
                  <span className="text-sm font-medium text-gray-600">Total seleccionado</span>
                  <span className="text-base font-bold text-[#101828]">
                    {fmtMoney(totalSeleccionado)}
                  </span>
                </div>
              )}

              {modoReparto ? (
                <>
                  {/* Reparto por comprobante: el club decide cuánto le paga a
                      cada factura tildada (pedido del cliente 2026-08-05). */}
                  <div>
                    <p className="mb-2 text-xs font-semibold" style={{ color: '#101828' }}>
                      Cuánto cobrás de cada comprobante
                    </p>
                    <div className="divide-y divide-gray-100 rounded-[10px] border border-gray-200">
                      {seleccionados.map((c) => {
                        const pend = pendienteDe(c);
                        const monto = parseFloat(montoToNumberStr(montosPorComp[c.id] ?? '0')) || 0;
                        const excede = monto > pend + 0.01;
                        return (
                          <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                            <div className="flex flex-1 flex-col">
                              <span className="text-sm font-medium text-[#101828]">
                                {c.codigo ?? 'Sin código'}
                                <span className="ml-2 text-xs font-normal text-gray-400">
                                  {TIPO_COMPROBANTE_LABEL[c.tipoFactura ?? ''] ?? c.tipoFactura}
                                </span>
                              </span>
                              <span className="text-xs text-gray-400">debe {fmtMoney(pend)}</span>
                            </div>
                            <input
                              inputMode="decimal"
                              placeholder="0,00"
                              value={montosPorComp[c.id] ?? ''}
                              onChange={(e) => handleMontoCompChange(c.id, e.target.value)}
                              className={`h-10 w-24 rounded-[10px] border bg-white px-3 text-right text-sm text-[#101828] focus:ring-1 focus:outline-none ${
                                excede
                                  ? 'border-red-300 focus:border-red-400 focus:ring-red-400'
                                  : 'border-gray-200 focus:border-[#175861] focus:ring-[#175861]'
                              }`}
                            />
                          </div>
                        );
                      })}
                    </div>
                    {!repartoValido && (
                      <p className="mt-1.5 text-xs text-red-600">
                        Algún comprobante tiene un monto mayor a lo que debe. Ajustalo para
                        continuar.
                      </p>
                    )}
                  </div>
                  <Field label="Fecha">
                    <input
                      type="date"
                      className={inputCls}
                      value={fecha}
                      onChange={(e) => setFecha(e.target.value)}
                    />
                  </Field>
                  <div className="flex items-center justify-between rounded-[10px] bg-gray-50 px-4 py-3">
                    <span className="text-sm font-medium text-gray-600">Total a cobrar</span>
                    <span className="text-base font-bold text-[#101828]">{fmtMoney(montoNum)}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Monto a cobrar">
                      <input
                        className={inputCls}
                        inputMode="decimal"
                        placeholder="0,00"
                        value={montoAPagar}
                        onChange={(e) => handleMontoAPagarChange(e.target.value)}
                      />
                    </Field>
                    <Field label="Fecha">
                      <input
                        type="date"
                        className={inputCls}
                        value={fecha}
                        onChange={(e) => setFecha(e.target.value)}
                      />
                    </Field>
                  </div>

                  {selected.size === 0 ? (
                    <p className="text-xs text-amber-600">
                      Cobranza sin comprobantes: el monto se registra como adelanto y queda como
                      saldo a favor en la cuenta corriente del socio.
                    </p>
                  ) : (
                    <>
                      {montoNum > totalSeleccionado + 0.01 && (
                        <p className="text-xs text-amber-600">
                          El excedente de {fmtMoney(montoNum - totalSeleccionado)} queda como saldo
                          a favor.
                        </p>
                      )}
                      {montoNum > 0 && montoNum < totalSeleccionado - 0.01 && (
                        <p className="text-xs text-amber-600">
                          Pago parcial: se aplica al comprobante seleccionado; lo que falte queda
                          pendiente en ese comprobante.
                        </p>
                      )}
                    </>
                  )}
                </>
              )}

              <div className="border-t border-gray-100 pt-3">
                <p className="mb-2 text-xs font-semibold text-gray-500">Formas de pago</p>
                <FormasDePago
                  formas={formas}
                  setFormas={setFormas}
                  montoAPagar={montoAPagar}
                  tarjetaGuardada={tarjetaGuardada}
                  tiposPermitidos={tiposPermitidos}
                />
              </div>

              <div
                className={`flex items-center justify-between rounded-[10px] px-4 py-3 ${
                  cuadra ? 'bg-gray-50' : 'bg-amber-50'
                }`}
              >
                <span className="text-sm font-medium text-gray-600">Cargado</span>
                <span className="text-sm font-bold text-[#101828]">
                  {fmtMoney(totalCargado)}
                  {!cuadra && (
                    <span className="ml-2 text-xs font-normal text-amber-600">
                      ≠ {fmtMoney(montoNum)}
                    </span>
                  )}
                </span>
              </div>
            </>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-6">
          <div className="flex gap-3">
            {step === 'comprobantes' && (
              <>
                <button
                  onClick={() => {
                    setStep('socio');
                    setError(null);
                  }}
                  className="flex-1 rounded-[10px] border border-[#d1d5dc] bg-white py-2.5 text-sm font-medium text-[#364153] transition hover:bg-gray-50"
                >
                  Atrás
                </button>
                {/* Sin selección también se puede continuar: cobranza sin
                    comprobante = adelanto (saldo a favor). */}
                <button
                  onClick={irAPago}
                  className="flex-1 rounded-[10px] py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ background: '#175861' }}
                >
                  {selected.size === 0 ? 'Continuar sin comprobantes' : 'Continuar'}
                </button>
              </>
            )}
            {step === 'pago' && (
              <>
                <button
                  onClick={() => {
                    setStep('comprobantes');
                    setError(null);
                  }}
                  className="flex-1 rounded-[10px] border border-[#d1d5dc] bg-white py-2.5 text-sm font-medium text-[#364153] transition hover:bg-gray-50"
                >
                  Atrás
                </button>
                <button
                  onClick={handleRegistrar}
                  disabled={isPending || !pagoValido}
                  className="flex-1 rounded-[10px] py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ background: '#175861' }}
                >
                  {isPending ? 'Guardando...' : 'Registrar cobranza'}
                </button>
              </>
            )}
            {step === 'socio' && (
              <button
                onClick={onClose}
                className="flex-1 rounded-[10px] border border-[#d1d5dc] bg-white py-2.5 text-sm font-medium text-[#364153] transition hover:bg-gray-50"
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      </div>
    </Overlay>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      {children}
    </div>
  );
}
