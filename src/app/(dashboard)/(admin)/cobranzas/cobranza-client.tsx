'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCircle2, Plus, Search, X } from 'lucide-react';

import { FORMAS_PAGO, Field, FormaPagoFields, inputCls } from '@/components/shared/forma-pago';
import { formatArgentinaDate } from '@/lib/dates';
import {
  getComprobantesPendientesAction,
  registrarCobranzaAction,
  type ComprobantePendiente,
} from '@/app/actions/cobranzas';
import { crearReciboInternoAction } from '@/app/actions/facturacion';

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
  recibo: 'Recibo interno',
};

function fmtMoney(amount: number): string {
  return `$${amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
}

function todayISODate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function CobranzaClient({ socios }: { socios: SocioOption[] }) {
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

      {modalOpen && <NuevaCobranzaModal socios={socios} onClose={() => setModalOpen(false)} />}
    </div>
  );
}

type Step = 'socio' | 'comprobantes' | 'pago' | 'post-pago' | 'recibo-creado';

function NuevaCobranzaModal({ socios, onClose }: { socios: SocioOption[]; onClose: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('socio');

  // Paso socio
  const [query, setQuery] = useState('');
  const [socio, setSocio] = useState<SocioOption | null>(null);

  // Paso comprobantes
  const [comprobantes, setComprobantes] = useState<ComprobantePendiente[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingComps, setLoadingComps] = useState(false);

  // Paso pago
  const [formaDePago, setFormaDePago] = useState('');
  const [datosPago, setDatosPago] = useState<Record<string, string>>({});
  const [fecha, setFecha] = useState(todayISODate);

  // Resultado
  const [pagoResult, setPagoResult] = useState<{
    movimientoId: string;
    concepto: string;
    importe: string;
  } | null>(null);
  const [reciboId, setReciboId] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const sociosFiltrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return socios.slice(0, 50);
    return socios
      .filter((s) => {
        if (s.nombre.toLowerCase().includes(q)) return true;
        if (s.numeroSocio != null && String(s.numeroSocio).includes(q)) return true;
        if (s.embarcaciones.some((e) => e.toLowerCase().includes(q))) return true;
        return false;
      })
      .slice(0, 50);
  }, [socios, query]);

  const totalSeleccionado = useMemo(
    () =>
      comprobantes
        .filter((c) => selected.has(c.id))
        .reduce((acc, c) => acc + parseFloat(c.importe ?? '0'), 0),
    [comprobantes, selected],
  );

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
      prev.size === comprobantes.length ? new Set() : new Set(comprobantes.map((c) => c.id)),
    );
  }

  function handleRegistrar() {
    if (!socio) return;
    setError(null);
    startTransition(async () => {
      const res = await registrarCobranzaAction({
        socioId: socio.id,
        comprobanteIds: [...selected],
        fecha,
        formaDePago,
        datosPago: datosPago as Record<string, unknown>,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setPagoResult({
        movimientoId: res.movimientoId!,
        concepto: res.concepto!,
        importe: res.importe!,
      });
      setStep('post-pago');
    });
  }

  function handleCrearRecibo() {
    if (!pagoResult || !socio) return;
    startTransition(async () => {
      const res = await crearReciboInternoAction({
        socioId: socio.id,
        movimientoId: pagoResult.movimientoId,
        importe: pagoResult.importe,
        descripcion: pagoResult.concepto,
        medioPago: formaDePago,
        fecha,
      });
      if (res.error) {
        setError(res.error);
      } else {
        setReciboId(res.id!);
        setStep('recibo-creado');
      }
    });
  }

  function handleFinalClose() {
    onClose();
    router.refresh();
  }

  const formaValida = Boolean(formaDePago);

  // ─── Paso post-pago ──────────────────────────────────────────────────────────
  if (step === 'post-pago') {
    return (
      <Overlay>
        <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl">
          <div className="p-6 pb-4">
            <h2 className="text-[18px] font-bold" style={{ color: '#101828' }}>
              Cobranza registrada
            </h2>
            <p className="mt-0.5 text-sm" style={{ color: '#669E9D' }}>
              ¿Desea emitir un comprobante para {socio?.nombre}?
            </p>
          </div>
          <div className="border-t border-gray-200" />
          <div className="space-y-3 p-6">
            <button
              onClick={() => {
                toast.success('Cobranza registrada');
                onClose();
                router.push('/facturacion');
                router.refresh();
              }}
              className="w-full rounded-[10px] border border-[#175861] bg-white px-4 py-3 text-left text-sm font-medium text-[#175861] transition hover:bg-teal-50"
            >
              <span className="font-semibold">Factura ARCA</span>
              <span className="ml-2 text-xs text-gray-400">Se emite con CAE</span>
            </button>
            <button
              onClick={handleCrearRecibo}
              disabled={isPending}
              className="w-full rounded-[10px] border border-gray-200 bg-white px-4 py-3 text-left text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
            >
              <span className="font-semibold">Comprobante interno</span>
              <span className="ml-2 text-xs text-gray-400">Sin valor fiscal</span>
            </button>
            <button
              onClick={() => {
                toast.success('Cobranza registrada');
                handleFinalClose();
              }}
              className="w-full rounded-[10px] px-4 py-3 text-left text-sm font-medium text-gray-500 transition hover:bg-gray-50"
            >
              Sin comprobante
              <span className="ml-2 text-xs text-gray-400">Solo movimiento</span>
            </button>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        </div>
      </Overlay>
    );
  }

  // ─── Paso recibo-creado ──────────────────────────────────────────────────────
  if (step === 'recibo-creado') {
    return (
      <Overlay>
        <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl">
          <div className="flex flex-col items-center p-6 text-center">
            <CheckCircle2 className="mb-3 h-12 w-12 text-teal-600" />
            <h2 className="text-[18px] font-bold" style={{ color: '#101828' }}>
              Comprobante creado
            </h2>
            <p className="mt-1 text-sm" style={{ color: '#669E9D' }}>
              La cobranza y el recibo interno fueron registrados.
            </p>
          </div>
          <div className="border-t border-gray-200" />
          <div className="flex gap-3 p-6">
            <button
              onClick={() => {
                toast.success('Cobranza registrada');
                handleFinalClose();
              }}
              className="flex-1 rounded-[10px] border border-[#d1d5dc] bg-white py-2.5 text-sm font-medium text-[#364153] transition hover:bg-gray-50"
            >
              Cerrar
            </button>
            <a
              href={`/facturacion/recibo/${reciboId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-1 items-center justify-center gap-2 rounded-[10px] py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ background: '#175861' }}
            >
              Ver comprobante
            </a>
          </div>
        </div>
      </Overlay>
    );
  }

  // ─── Pasos socio / comprobantes / pago ───────────────────────────────────────
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
          {/* Paso 1: elegir socio */}
          {step === 'socio' && (
            <>
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
              ) : comprobantes.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">
                  Este socio no tiene comprobantes pendientes de cobro.
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <button
                      onClick={toggleAll}
                      className="text-xs font-medium text-[#175861] hover:underline"
                    >
                      {selected.size === comprobantes.length
                        ? 'Deseleccionar todos'
                        : 'Seleccionar todos'}
                    </button>
                    <span className="text-xs text-gray-400">
                      {selected.size} de {comprobantes.length}
                    </span>
                  </div>
                  <div className="divide-y divide-gray-100 rounded-[10px] border border-gray-200">
                    {comprobantes.map((c) => (
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
                          </span>
                        </div>
                        <span className="text-sm font-semibold text-[#101828]">
                          {fmtMoney(parseFloat(c.importe ?? '0'))}
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
              <div className="flex items-center justify-between rounded-[10px] bg-gray-50 px-4 py-3">
                <span className="text-sm font-medium text-gray-600">Total a cobrar</span>
                <span className="text-[18px] font-bold text-[#101828]">
                  {fmtMoney(totalSeleccionado)}
                </span>
              </div>
              <Field label="Fecha">
                <input
                  type="date"
                  className={inputCls}
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                />
              </Field>
              <Field label="Forma de pago">
                <select
                  className={inputCls}
                  value={formaDePago}
                  onChange={(e) => {
                    setFormaDePago(e.target.value);
                    setDatosPago({});
                  }}
                >
                  <option value="">Seleccione una opción...</option>
                  {FORMAS_PAGO.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
              <FormaPagoFields
                formaDePago={formaDePago}
                datosPago={datosPago}
                setDatosPago={setDatosPago}
              />
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
                <button
                  onClick={() => setStep('pago')}
                  disabled={selected.size === 0}
                  className="flex-1 rounded-[10px] py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ background: '#175861' }}
                >
                  Continuar
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
                  disabled={isPending || !formaValida || selected.size === 0}
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
