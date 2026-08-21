'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
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
  getSaldoAFavorAction,
  registrarCobranzaAction,
  type ComprobantePendiente,
  type NotaCreditoSuelta,
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
  // Saldo a favor disponible del socio (adelantos/excedentes sin usar) — se
  // ofrece como opción para cubrir parte del cobro (pedido 2026-08-06).
  const [saldoDisponible, setSaldoDisponible] = useState(0);
  const [usarSaldoAFavor, setUsarSaldoAFavor] = useState(false);
  // Notas de crédito sueltas del socio (crédito emitido sin factura asignada) y
  // la factura que el club eligió para cada una.
  const [notasCredito, setNotasCredito] = useState<NotaCreditoSuelta[]>([]);
  // Notas de credito tildadas en el listado. La factura a la que van la
  // resuelve ncAsignadas; el club no la elige.
  const [ncSeleccionadas, setNcSeleccionadas] = useState<Set<string>>(new Set());
  // Cuánto del saldo a favor aplicar. Editable: el club puede usar solo una
  // parte del crédito disponible y cobrar el resto (pedido 2026-08-10). Al
  // tildar arranca en el máximo aplicable y se puede bajar; nunca puede superar
  // ni el disponible ni el total a cobrar.
  const [saldoAFavorInput, setSaldoAFavorInput] = useState('');

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

  // Las NC solo aplican al canal fiscal (las internas anulan comprobantes
  // internos, que se cobran por el otro canal).
  const notasCreditoCanal = useMemo(
    () =>
      notasCredito.filter(
        (n) => (n.tipoFactura === 'nota_credito_interna') === (canal === 'interno'),
      ),
    [notasCredito, canal],
  );

  /**
   * A qué factura va cada nota tildada. El club no la elige: se asigna a la
   * primera factura seleccionada que la pueda absorber entera, del más viejo al
   * más nuevo. Una nota va contra UNA sola factura (el modelo guarda un único
   * `facturaOriginalId`), así que una nota más grande que cualquiera de las
   * facturas tildadas queda sin asignar y se avisa en su fila.
   */
  const ncAsignadas = useMemo(() => {
    const elegidas = notasCreditoCanal.filter((n) => ncSeleccionadas.has(n.id));
    if (elegidas.length === 0) return [];

    // Cupo restante de cada factura tildada, en el orden en que se listan.
    const cupo = new Map<string, number>();
    for (const c of seleccionados) {
      cupo.set(c.id, parseFloat(c.importePendiente ?? c.importe ?? '0'));
    }

    const out: Array<{ nota: NotaCreditoSuelta; comprobanteId: string; codigo: string | null }> =
      [];
    for (const n of elegidas) {
      const monto = parseFloat(n.importe ?? '0');
      const destino = seleccionados.find((c) => (cupo.get(c.id) ?? 0) >= monto - 0.005);
      if (!destino) continue;
      cupo.set(destino.id, (cupo.get(destino.id) ?? 0) - monto);
      out.push({ nota: n, comprobanteId: destino.id, codigo: destino.codigo });
    }
    return out;
  }, [notasCreditoCanal, ncSeleccionadas, seleccionados]);

  const ncAplicadas = ncAsignadas;

  const totalNc = useMemo(
    () => ncAsignadas.reduce((acc, x) => acc + parseFloat(x.nota.importe ?? '0'), 0),
    [ncAsignadas],
  );

  /** Cuánto le resta una NC a un comprobante puntual en esta cobranza. */
  const ncDeComprobante = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of ncAsignadas) {
      m.set(x.comprobanteId, (m.get(x.comprobanteId) ?? 0) + parseFloat(x.nota.importe ?? '0'));
    }
    return m;
  }, [ncAsignadas]);

  // Lo seleccionado se suma por el saldo PENDIENTE de cada comprobante (si ya
  // tuvo un cobro parcial o una NC, se cobra solo lo que falta), menos lo que le
  // resta una nota de crédito que se junte en esta misma cobranza.
  const totalSeleccionado = useMemo(
    () =>
      seleccionados.reduce((acc, c) => {
        const pendiente = parseFloat(c.importePendiente ?? c.importe ?? '0');
        return acc + Math.max(0, pendiente - (ncDeComprobante.get(c.id) ?? 0));
      }, 0),
    [seleccionados, ncDeComprobante],
  );

  // Lo que queda por COBRAR de un comprobante en esta cobranza: su pendiente
  // menos lo que le resta una nota de crédito que se junte acá. Tiene que
  // coincidir con el tope que valida el server (`restanteDe` en
  // actions/cobranzas.ts), o el reparto dejaría cargar más de lo que se debe.
  // useCallback y no una función suelta: depende de `ncDeComprobante`, así que
  // tildar una nota tiene que recalcular lo que la usa (el reparto valida contra
  // esto). Como función suelta el linter no podía verificarlo y la validación
  // podía quedar con el tope viejo.
  const pendienteDe = useCallback(
    (c: ComprobantePendiente): number => {
      const pendiente = parseFloat(c.importePendiente ?? c.importe ?? '0');
      return Math.max(0, pendiente - (ncDeComprobante.get(c.id) ?? 0));
    },
    [ncDeComprobante],
  );

  // Cobrando internos, el dropdown de formas solo muestra los medios que el
  // club habilitó en la Configuración de cobranzas. Fiscal: lista completa.
  const tiposPermitidos = canal === 'interno' ? mediosInternos : null;
  // Puede ser 0 si el club solo habilitó medios sin cobro manual (ej. solo
  // Débito automático): en ese caso Registrar queda deshabilitado (el aviso
  // lo muestra FormasDePago).
  const hayMediosManuales = tiposCobranzaPermitidos(tiposPermitidos).length > 0;

  // montoNum = total a aplicar a los comprobantes (casilleros de reparto, o el
  // campo único en modo simple). El saldo a favor cubre hasta ese total; lo
  // que sobra (montoEfectivo) es lo que hay que cobrar con formas de pago.
  const montoNum = parseFloat(montoToNumberStr(montoAPagar)) || 0;
  const creditoPedido = usarSaldoAFavor ? parseFloat(montoToNumberStr(saldoAFavorInput)) || 0 : 0;
  // No se puede aplicar más crédito del que el socio tiene. Que el pedido supere
  // el total a cobrar no es un error (significa "cubrilo todo"): se acota solo.
  const creditoExcedeDisponible = creditoPedido > saldoDisponible + 0.01;
  const montoCredito = usarSaldoAFavor ? Math.min(creditoPedido, saldoDisponible, montoNum) : 0;
  const montoEfectivo = Math.max(0, montoNum - montoCredito);
  const totalCargado = useMemo(
    () => formas.reduce((acc, f) => acc + (parseFloat(montoToNumberStr(f.monto)) || 0), 0),
    [formas],
  );
  const cuadra = Math.abs(totalCargado - montoEfectivo) < 0.01;
  // En modo reparto ningún comprobante puede recibir más de lo que debe (el
  // excedente no tiene dónde ir: un comprobante no se sobre-cobra).
  const repartoValido = useMemo(() => {
    if (!modoReparto) return true;
    return seleccionados.every((c) => {
      const monto = parseFloat(montoToNumberStr(montosPorComp[c.id] ?? '0')) || 0;
      return monto >= 0 && monto <= pendienteDe(c) + 0.01;
    });
  }, [modoReparto, seleccionados, montosPorComp, pendienteDe]);
  // Con el total ya cubierto por saldo a favor no hace falta ninguna forma de
  // pago (montoEfectivo = 0); si falta plata real, sí.
  const pagoValido =
    montoNum > 0 &&
    cuadra &&
    (montoEfectivo <= 0.005 || (formas.length > 0 && hayMediosManuales)) &&
    repartoValido &&
    !creditoExcedeDisponible;

  function handleSelectSocio(s: SocioOption) {
    setSocio(s);
    setError(null);
    setLoadingComps(true);
    setSaldoDisponible(0);
    setUsarSaldoAFavor(false);
    setSaldoAFavorInput('');
    setStep('comprobantes');
    startTransition(async () => {
      const [res, saldoRes] = await Promise.all([
        getComprobantesPendientesAction(s.id),
        getSaldoAFavorAction(s.id),
      ]);
      setLoadingComps(false);
      if (res.error) {
        setError(res.error);
        setComprobantes([]);
        return;
      }
      setComprobantes(res.comprobantes ?? []);
      setNotasCredito(res.notasCredito ?? []);
      setNcSeleccionadas(new Set());
      setTarjetaGuardada(res.tarjeta ?? null);
      setSelected(new Set());
      setSaldoDisponible(saldoRes.disponible ?? 0);
    });
  }

  function toggleNotaCredito(id: string) {
    setNcSeleccionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
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

  // Cuánto de un total a aplicar queda cubierto en efectivo (formas de pago)
  // una vez descontado el saldo a favor que el admin eligió usar.
  function efectivoDe(total: number): number {
    const credito = usarSaldoAFavor
      ? Math.min(parseFloat(montoToNumberStr(saldoAFavorInput)) || 0, saldoDisponible, total)
      : 0;
    return Math.max(0, total - credito);
  }

  function irAPago() {
    // Pre-llenar el monto a pagar y la única forma de pago (se mantienen
    // sincronizados mientras haya una sola forma — ver
    // `handleMontoAPagarChange`). Si el admin agrega más formas para partir el
    // pago, cada una se edita por separado. Si ya venía crédito a favor tildado
    // (volvió Atrás y siguió), la forma arranca por el efectivo, no por el total.
    //
    // Reparto: cada comprobante arranca con su saldo pendiente entero, pero si
    // el admin ya había escrito un monto para ese comprobante se respeta —
    // volver Atrás a corregir la selección no debe borrar el reparto cargado.
    const montos: Record<string, string> = {};
    for (const c of seleccionados) {
      montos[c.id] = montosPorComp[c.id] ?? pendienteDe(c).toFixed(2);
    }
    setMontosPorComp(montos);
    // El monto a cobrar es la suma del reparto (no el total pendiente), para que
    // coincida con los casilleros cuando vienen de una edición previa.
    const suma = seleccionados.reduce(
      (acc, c) => acc + (parseFloat(montoToNumberStr(montos[c.id] ?? '0')) || 0),
      0,
    );
    const inicial = suma > 0 ? suma.toFixed(2) : '';
    setMontoAPagar(inicial);
    const efectivo = efectivoDe(suma);
    setFormas([
      { ...nuevaForma(tiposPermitidos), monto: efectivo > 0.005 ? efectivo.toFixed(2) : '' },
    ]);
    setError(null);
    setStep('pago');
  }

  function sincronizarConMonto(montoEfectivoStr: string) {
    // Con una sola forma de pago no tiene sentido pedirle al admin que
    // escriba el mismo importe dos veces — se sigue el monto efectivo a
    // cobrar (total menos el saldo a favor aplicado).
    setFormas((prev) => (prev.length === 1 ? [{ ...prev[0], monto: montoEfectivoStr }] : prev));
  }

  function handleMontoAPagarChange(value: string) {
    const limpio = sanitizeMontoInput(value);
    setMontoAPagar(limpio);
    const efectivo = efectivoDe(parseFloat(montoToNumberStr(limpio)) || 0);
    sincronizarConMonto(efectivo > 0.005 ? efectivo.toFixed(2) : '');
  }

  function handleToggleSaldoAFavor() {
    const next = !usarSaldoAFavor;
    setUsarSaldoAFavor(next);
    // Al tildar arranca en el máximo aplicable (lo más común es usar todo el
    // crédito); el admin lo puede bajar. Al destildar se limpia.
    const credito = next ? Math.min(saldoDisponible, montoNum) : 0;
    setSaldoAFavorInput(next && credito > 0 ? credito.toFixed(2) : '');
    const efectivo = Math.max(0, montoNum - credito);
    sincronizarConMonto(efectivo > 0.005 ? efectivo.toFixed(2) : '');
  }

  function handleSaldoAFavorChange(value: string) {
    const limpio = sanitizeMontoInput(value);
    setSaldoAFavorInput(limpio);
    const credito = Math.min(parseFloat(montoToNumberStr(limpio)) || 0, saldoDisponible, montoNum);
    const efectivo = Math.max(0, montoNum - credito);
    sincronizarConMonto(efectivo > 0.005 ? efectivo.toFixed(2) : '');
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
    const efectivo = efectivoDe(suma);
    sincronizarConMonto(efectivo > 0.005 ? efectivo.toFixed(2) : '');
  }

  function handleRegistrar() {
    if (!socio) return;
    setError(null);
    startTransition(async () => {
      const res = await registrarCobranzaAction({
        socioId: socio.id,
        comprobanteIds: [...selected],
        fecha,
        montoAPagar: montoEfectivo.toFixed(2),
        montoSaldoAFavor: montoCredito > 0.005 ? montoCredito.toFixed(2) : undefined,
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
        notasCredito: ncAplicadas.length
          ? ncAplicadas.map((x) => ({ notaId: x.nota.id, comprobanteId: x.comprobanteId }))
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

                    {/* Notas de crédito sueltas: un ítem más del listado, con el
                        importe en NEGATIVO. Tildarlas las resta del total; a qué
                        factura se imputa lo resuelve `ncAsignadas` (la primera
                        de las tildadas que la pueda absorber). */}
                    {notasCreditoCanal.map((n) => {
                      const monto = parseFloat(n.importe ?? '0');
                      const asignada = ncAsignadas.find((x) => x.nota.id === n.id);
                      const tildada = ncSeleccionadas.has(n.id);
                      return (
                        <label
                          key={n.id}
                          className="flex cursor-pointer items-center gap-3 px-4 py-3 transition hover:bg-gray-50"
                        >
                          <input
                            type="checkbox"
                            checked={tildada}
                            onChange={() => toggleNotaCredito(n.id)}
                            className="h-4 w-4 accent-[#175861]"
                          />
                          <div className="flex flex-1 flex-col">
                            <span className="text-sm font-medium text-[#101828]">
                              {n.codigo ?? 'Sin código'}
                              <span className="ml-2 text-xs font-normal text-gray-400">
                                {TIPO_COMPROBANTE_LABEL[n.tipoFactura ?? ''] ?? 'Nota de crédito'}
                              </span>
                            </span>
                            <span className="text-xs text-gray-400">
                              {n.emision ? formatArgentinaDate(n.emision) : '—'}
                              {tildada && asignada
                                ? ` · Se junta con ${asignada.codigo ?? 'la factura elegida'}`
                                : tildada
                                  ? ' · Elegí una factura que la pueda cubrir'
                                  : ''}
                            </span>
                          </div>
                          <span className="text-sm font-semibold" style={{ color: '#175861' }}>
                            −{fmtMoney(monto)}
                          </span>
                        </label>
                      );
                    })}
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

              {/* Las notas de crédito ya se eligen en el listado de
                  comprobantes, como un ítem más en negativo. Acá solo se informa
                  cuánto restaron, para que el total cierre a la vista. */}
              {totalNc > 0 && (
                <div className="flex items-center justify-between rounded-[10px] border border-gray-200 px-4 py-3">
                  <span className="text-sm text-gray-600">Notas de crédito aplicadas</span>
                  <span className="text-sm font-semibold" style={{ color: '#175861' }}>
                    −{fmtMoney(totalNc)}
                  </span>
                </div>
              )}

              {/* Usar saldo a favor: cubre hasta el total a aplicar y reduce
                  lo que hace falta cobrar con formas de pago (pedido 2026-08-06). */}
              {selected.size > 0 && saldoDisponible > 0 && (
                <div className="rounded-[10px] border border-gray-200">
                  <label className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={usarSaldoAFavor}
                      onChange={handleToggleSaldoAFavor}
                      className="h-4 w-4 accent-[#175861]"
                    />
                    <div className="flex-1">
                      <span className="text-sm font-medium text-[#101828]">
                        Usar saldo a favor disponible
                      </span>
                      <span className="ml-1 text-sm text-gray-400">
                        ({fmtMoney(saldoDisponible)})
                      </span>
                    </div>
                    {usarSaldoAFavor && montoCredito > 0 && (
                      <span className="text-sm font-semibold" style={{ color: '#175861' }}>
                        −{fmtMoney(montoCredito)}
                      </span>
                    )}
                  </label>
                  {/* Monto editable: se puede aplicar solo una parte del crédito
                      y cobrar el resto. Tope = lo disponible. */}
                  {usarSaldoAFavor && (
                    <div className="border-t border-gray-100 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex-1 text-xs font-semibold text-[#101828]">
                          Cuánto saldo a favor aplicar
                        </span>
                        <input
                          inputMode="decimal"
                          placeholder="0,00"
                          value={saldoAFavorInput}
                          onChange={(e) => handleSaldoAFavorChange(e.target.value)}
                          className={`h-10 w-28 rounded-[10px] border bg-white px-3 text-right text-sm text-[#101828] focus:ring-1 focus:outline-none ${
                            creditoExcedeDisponible
                              ? 'border-red-300 focus:border-red-400 focus:ring-red-400'
                              : 'border-gray-200 focus:border-[#175861] focus:ring-[#175861]'
                          }`}
                        />
                      </div>
                      {creditoExcedeDisponible ? (
                        <p className="mt-1.5 text-xs text-red-600">
                          El saldo a favor disponible es {fmtMoney(saldoDisponible)}. No se puede
                          aplicar más que eso.
                        </p>
                      ) : (
                        creditoPedido > montoNum + 0.01 && (
                          <p className="mt-1.5 text-xs text-amber-600">
                            El total a cobrar es {fmtMoney(montoNum)}: se aplican{' '}
                            {fmtMoney(montoCredito)} y el resto del crédito queda disponible.
                          </p>
                        )
                      )}
                    </div>
                  )}
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
                    <span className="text-sm font-medium text-gray-600">
                      {montoCredito > 0 ? 'A cobrar en efectivo' : 'Total a cobrar'}
                    </span>
                    <span className="text-base font-bold text-[#101828]">
                      {fmtMoney(montoEfectivo)}
                    </span>
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

              {usarSaldoAFavor && montoNum > 0.005 && montoEfectivo <= 0.005 ? (
                <p
                  className="rounded-[10px] bg-teal-50 px-4 py-3 text-sm"
                  style={{ color: '#175861' }}
                >
                  Cubierto por completo con saldo a favor — no hace falta ninguna forma de pago.
                </p>
              ) : (
                <>
                  <div className="border-t border-gray-100 pt-3">
                    <p className="mb-2 text-xs font-semibold text-gray-500">Formas de pago</p>
                    <FormasDePago
                      formas={formas}
                      setFormas={setFormas}
                      montoAPagar={montoEfectivo.toFixed(2)}
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
                          ≠ {fmtMoney(montoEfectivo)}
                        </span>
                      )}
                    </span>
                  </div>
                </>
              )}
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
