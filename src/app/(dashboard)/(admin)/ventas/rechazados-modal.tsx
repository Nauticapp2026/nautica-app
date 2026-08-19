'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, ExternalLink, Loader2, X } from 'lucide-react';

import { reenviarFacturaRechazadaAction } from '@/app/actions/facturacion';
import { updateDatosFiscalesSocioAction } from '@/app/actions/socios';
import { clasificarRechazo, type CausaRechazo } from './rechazos';

// Mismas etiquetas que en la ficha del socio (Datos Impositivos): que el club
// lea lo mismo en los dos lugares.
const CONDICION_IVA_OPTS = [
  { value: 'responsable_inscripto', label: 'IVA Responsable Inscripto' },
  { value: 'exento', label: 'IVA Sujeto Exento' },
  { value: 'monotributo', label: 'Responsable Monotributo' },
  { value: 'consumidor_final', label: 'Consumidor Final' },
  { value: 'proveedor_exterior', label: 'Proveedor del Exterior' },
  { value: 'cliente_exterior', label: 'Cliente del Exterior' },
  { value: 'iva_no_alcanzado', label: 'IVA No Alcanzado' },
];

const TIPO_DOC_OPTS = [
  { value: 'cuit', label: 'CUIT' },
  { value: 'dni', label: 'DNI' },
  { value: 'cuil', label: 'CUIL' },
  { value: 'cdi', label: 'CDI' },
  { value: 'pasaporte', label: 'Pasaporte' },
];

const inputCls =
  'h-9 w-full rounded-[8px] border border-gray-200 bg-white px-2.5 text-sm text-[#101828] focus:border-[#175861] focus:ring-1 focus:ring-[#175861] focus:outline-none';

export type RechazadaFactura = {
  id: string;
  tipoFactura: string | null;
  importe: string | null;
  emision: string | null;
  descripcion: string | null;
  socioId: string | null;
  socioNombre: string;
  motivoError: string | null;
};

export type RechazadaSocio = {
  id: string;
  nombre: string;
  razonSocial: string | null;
  numeroDocumento: string;
  tipoDocumento: string | null;
  cuit: string | null;
  condicionIva: string | null;
  condicionIvaPersonal: string | null;
  facturaFiscal: boolean;
};

/** Datos fiscales editables de un socio, tal como se editan en el modal. */
type FormSocio = {
  tipoDocumento: string;
  numeroDocumento: string;
  cuit: string;
  razonSocial: string;
  condicionIva: string;
  condicionIvaPersonal: string;
  facturaFiscal: boolean;
};

type ResultadoEnvio =
  | { estado: 'enviando' }
  | { estado: 'ok'; comprobante?: string }
  | { estado: 'error'; mensaje: string };

const TIPO_LABEL: Record<string, string> = {
  factura_a: 'Factura A',
  factura_b: 'Factura B',
  factura_c: 'Factura C',
  nota_credito_a: 'NC A',
  nota_credito_b: 'NC B',
  nota_credito_c: 'NC C',
  nota_debito_a: 'ND A',
  nota_debito_b: 'ND B',
  nota_debito_c: 'ND C',
};

// Solo las facturas se pueden reenviar por esta vía (igual que el botón por fila
// en la tabla). Las NC/ND rechazadas se rehacen desde el comprobante original.
const REENVIABLES = new Set(['factura_a', 'factura_b', 'factura_c']);

function fmtMoney(v: string | null): string {
  const n = parseFloat(v ?? '0');
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
}

function socioAForm(s: RechazadaSocio): FormSocio {
  return {
    tipoDocumento: s.tipoDocumento ?? '',
    numeroDocumento: s.numeroDocumento ?? '',
    cuit: s.cuit ?? '',
    razonSocial: s.razonSocial ?? '',
    condicionIva: s.condicionIva ?? '',
    condicionIvaPersonal: s.condicionIvaPersonal ?? '',
    facturaFiscal: s.facturaFiscal,
  };
}

/**
 * Un solo lugar para trabajar los comprobantes que ARCA rechazó: agrupados por
 * causa (los mensajes traen el CUIT adentro, así que sin clasificar no agrupan),
 * con los datos del socio editables ahí mismo y el reenvío en tanda.
 *
 * El reenvío es secuencial a propósito: son comprobantes fiscales reales y la
 * numeración la asigna ARCA, así que no se disparan en paralelo.
 */
export function RechazadosModal({
  facturas,
  socios,
  onClose,
}: {
  facturas: RechazadaFactura[];
  socios: RechazadaSocio[];
  onClose: () => void;
}) {
  const router = useRouter();
  // Arranca vacío a propósito: emitir es irreversible (ARCA asigna CAE y no se
  // puede "desemitir", hay que hacer una NC). Que el club elija explícitamente
  // qué reenvía vale más que ahorrarle un clic.
  const [seleccion, setSeleccion] = useState<Set<string>>(() => new Set());
  const [forms, setForms] = useState<Record<string, FormSocio>>(() => {
    const out: Record<string, FormSocio> = {};
    for (const s of socios) out[s.id] = socioAForm(s);
    return out;
  });
  const [resultados, setResultados] = useState<Record<string, ResultadoEnvio>>({});
  const [enviando, setEnviando] = useState(false);
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);

  const sociosPorId = useMemo(() => {
    const m = new Map<string, RechazadaSocio>();
    for (const s of socios) m.set(s.id, s);
    return m;
  }, [socios]);

  // Agrupadas por causa, más grande primero: la causa que afecta a más
  // comprobantes es la que conviene atacar.
  const grupos = useMemo(() => {
    const m = new Map<string, { causa: CausaRechazo; items: RechazadaFactura[] }>();
    for (const f of facturas) {
      const causa = clasificarRechazo(f.motivoError);
      const g = m.get(causa.id) ?? { causa, items: [] };
      g.items.push(f);
      m.set(causa.id, g);
    }
    return [...m.values()].sort((a, b) => b.items.length - a.items.length);
  }, [facturas]);

  // Socios tocados por cada grupo, para mostrar el editor una vez por socio y
  // no una vez por comprobante (los datos son del socio, no del comprobante).
  function sociosDelGrupo(items: RechazadaFactura[]): RechazadaSocio[] {
    const ids = new Set<string>();
    const out: RechazadaSocio[] = [];
    for (const f of items) {
      if (!f.socioId || ids.has(f.socioId)) continue;
      const s = sociosPorId.get(f.socioId);
      if (!s) continue;
      ids.add(f.socioId);
      out.push(s);
    }
    return out;
  }

  function toggle(id: string) {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Los ya enviados con éxito no vuelven a entrar en la selección. */
  function reenviablesPendientes(items: RechazadaFactura[]): RechazadaFactura[] {
    return items.filter(
      (f) => REENVIABLES.has(f.tipoFactura ?? '') && resultados[f.id]?.estado !== 'ok',
    );
  }

  function todosDelGrupoSeleccionados(items: RechazadaFactura[]): boolean {
    const elegibles = reenviablesPendientes(items);
    return elegibles.length > 0 && elegibles.every((f) => seleccion.has(f.id));
  }

  function toggleGrupo(items: RechazadaFactura[]) {
    const elegibles = reenviablesPendientes(items);
    const todos = todosDelGrupoSeleccionados(items);
    setSeleccion((prev) => {
      const next = new Set(prev);
      for (const f of elegibles) {
        if (todos) next.delete(f.id);
        else next.add(f.id);
      }
      return next;
    });
  }

  function setForm(socioId: string, patch: Partial<FormSocio>) {
    setForms((prev) => ({ ...prev, [socioId]: { ...prev[socioId], ...patch } }));
  }

  /** Socios cuyo formulario difiere de lo guardado. */
  function sociosModificados(): string[] {
    return socios
      .filter((s) => {
        const f = forms[s.id];
        if (!f) return false;
        const orig = socioAForm(s);
        return (
          f.tipoDocumento !== orig.tipoDocumento ||
          f.numeroDocumento !== orig.numeroDocumento ||
          f.cuit !== orig.cuit ||
          f.razonSocial !== orig.razonSocial ||
          f.condicionIva !== orig.condicionIva ||
          f.condicionIvaPersonal !== orig.condicionIvaPersonal ||
          f.facturaFiscal !== orig.facturaFiscal
        );
      })
      .map((s) => s.id);
  }

  async function guardarYEnviar() {
    const aEnviarCount = facturas.filter(
      (f) => seleccion.has(f.id) && REENVIABLES.has(f.tipoFactura ?? ''),
    ).length;

    // Emitir es irreversible: ARCA asigna el CAE y para dar marcha atrás hay que
    // emitir una nota de crédito. Se confirma explícitamente cuántos van.
    if (aEnviarCount > 0) {
      const ok = confirm(
        aEnviarCount === 1
          ? '¿Reenviar 1 comprobante a ARCA? Si sale bien queda emitido y no se puede deshacer (habría que hacer una nota de crédito).'
          : `¿Reenviar ${aEnviarCount} comprobantes a ARCA? Los que salgan bien quedan emitidos y no se pueden deshacer (habría que hacer una nota de crédito por cada uno).`,
      );
      if (!ok) return;
    }

    setErrorGlobal(null);
    setEnviando(true);
    try {
      // 1) Guardar los datos de socio que se hayan tocado. Si uno falla, se
      // corta: reenviar con los datos viejos volvería a rebotar.
      for (const socioId of sociosModificados()) {
        const f = forms[socioId];
        const res = await updateDatosFiscalesSocioAction({
          socioId,
          tipoDocumento: (f.tipoDocumento || null) as never,
          numeroDocumento: f.numeroDocumento,
          cuit: f.cuit,
          razonSocial: f.razonSocial,
          condicionIva: (f.condicionIva || null) as never,
          condicionIvaPersonal: (f.condicionIvaPersonal || null) as never,
          facturaFiscal: f.facturaFiscal,
        });
        if (res.error) {
          setErrorGlobal(`No se pudieron guardar los datos de un socio: ${res.error}`);
          setEnviando(false);
          return;
        }
      }

      // 2) Reenviar los seleccionados, de a uno.
      const hoy = new Date().toISOString().slice(0, 10);
      const aEnviar = facturas.filter(
        (f) => seleccion.has(f.id) && REENVIABLES.has(f.tipoFactura ?? ''),
      );

      for (const f of aEnviar) {
        setResultados((prev) => ({ ...prev, [f.id]: { estado: 'enviando' } }));
        const res = await reenviarFacturaRechazadaAction(f.id, {
          tipoFactura: (f.tipoFactura ?? 'factura_b') as never,
          descripcion: f.descripcion || undefined,
          fecha: hoy,
          vencimiento: hoy,
        });
        setResultados((prev) => ({
          ...prev,
          [f.id]: res.error
            ? { estado: 'error', mensaje: res.error }
            : { estado: 'ok', comprobante: res.comprobanteNro },
        }));
      }

      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  const seleccionados = facturas.filter(
    (f) => seleccion.has(f.id) && REENVIABLES.has(f.tipoFactura ?? ''),
  ).length;
  const modificados = sociosModificados().length;
  const enviadasOk = Object.values(resultados).filter((r) => r.estado === 'ok').length;
  const volvieronAFallar = Object.values(resultados).filter((r) => r.estado === 'error').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <h2 className="text-lg font-bold" style={{ color: '#101828' }}>
              Comprobantes rechazados
            </h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {facturas.length} rechazado{facturas.length === 1 ? '' : 's'} por ARCA, agrupados por
              motivo. Corregí los datos y reenviá desde acá.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-[8px] p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-t border-gray-200" />

        <div className="space-y-5 overflow-y-auto p-6">
          {grupos.map((g) => {
            const sociosGrupo = sociosDelGrupo(g.items);
            return (
              <section
                key={g.causa.id}
                className="overflow-hidden rounded-[12px] border border-gray-200"
              >
                <header className="border-b border-gray-200 bg-gray-50 px-4 py-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold" style={{ color: '#101828' }}>
                        {g.causa.titulo}
                        <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                          {g.items.length}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-gray-600">{g.causa.queHacer}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleGrupo(g.items)}
                      disabled={enviando}
                      className="ml-auto shrink-0 rounded-[8px] border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {todosDelGrupoSeleccionados(g.items) ? 'Ninguno' : 'Todos'}
                    </button>
                  </div>
                </header>

                {/* Editor de datos del socio: solo tiene sentido si la causa se
                    arregla con datos nuestros. Si no, se dice y no se ofrece. */}
                {g.causa.editableEnLaApp && sociosGrupo.length > 0 && (
                  <div className="space-y-3 border-b border-gray-100 bg-white px-4 py-3">
                    {sociosGrupo.map((s) => {
                      const f = forms[s.id];
                      if (!f) return null;
                      return (
                        <div key={s.id} className="rounded-[10px] bg-gray-50 p-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold" style={{ color: '#101828' }}>
                              {s.nombre}
                            </p>
                            <a
                              href={`/usuarios/${s.id}?tab=impositivos`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs text-[#175861] hover:underline"
                            >
                              Ficha completa
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                          <label className="mb-2 flex items-center gap-2 text-xs text-gray-600">
                            <input
                              type="checkbox"
                              className="accent-[#175861]"
                              checked={f.facturaFiscal}
                              onChange={(e) => setForm(s.id, { facturaFiscal: e.target.checked })}
                            />
                            Facturar con los datos personales (si está destildado usa los
                            impositivos)
                          </label>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            <div>
                              <label className="mb-1 block text-xs font-medium text-gray-500">
                                Tipo doc.
                              </label>
                              <select
                                className={inputCls}
                                value={f.tipoDocumento}
                                onChange={(e) => setForm(s.id, { tipoDocumento: e.target.value })}
                              >
                                <option value="">—</option>
                                {TIPO_DOC_OPTS.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-gray-500">
                                N° documento
                              </label>
                              <input
                                className={inputCls}
                                value={f.numeroDocumento}
                                onChange={(e) => setForm(s.id, { numeroDocumento: e.target.value })}
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-gray-500">
                                CUIT
                              </label>
                              <input
                                className={inputCls}
                                value={f.cuit}
                                onChange={(e) => setForm(s.id, { cuit: e.target.value })}
                              />
                            </div>
                            <div className="col-span-2 sm:col-span-1">
                              <label className="mb-1 block text-xs font-medium text-gray-500">
                                Razón social
                              </label>
                              <input
                                className={inputCls}
                                value={f.razonSocial}
                                onChange={(e) => setForm(s.id, { razonSocial: e.target.value })}
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-gray-500">
                                Cond. IVA (personales)
                              </label>
                              <select
                                className={inputCls}
                                value={f.condicionIvaPersonal}
                                onChange={(e) =>
                                  setForm(s.id, { condicionIvaPersonal: e.target.value })
                                }
                              >
                                <option value="">—</option>
                                {CONDICION_IVA_OPTS.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-gray-500">
                                Cond. IVA (impositivos)
                              </label>
                              <select
                                className={inputCls}
                                value={f.condicionIva}
                                onChange={(e) => setForm(s.id, { condicionIva: e.target.value })}
                              >
                                <option value="">—</option>
                                {CONDICION_IVA_OPTS.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <ul className="divide-y divide-gray-100">
                  {g.items.map((f) => {
                    const reenviable = REENVIABLES.has(f.tipoFactura ?? '');
                    const res = resultados[f.id];
                    return (
                      <li key={f.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                        <input
                          type="checkbox"
                          className="accent-[#175861] disabled:opacity-30"
                          checked={seleccion.has(f.id)}
                          disabled={!reenviable || enviando || res?.estado === 'ok'}
                          onChange={() => toggle(f.id)}
                        />
                        <span className="w-20 shrink-0 text-xs font-medium text-gray-500">
                          {TIPO_LABEL[f.tipoFactura ?? ''] ?? f.tipoFactura ?? '—'}
                        </span>
                        <span className="min-w-0 flex-1 truncate" style={{ color: '#101828' }}>
                          {f.socioNombre}
                        </span>
                        <span className="shrink-0 text-gray-600">{fmtMoney(f.importe)}</span>
                        <span className="w-40 shrink-0 text-right text-xs">
                          {res?.estado === 'enviando' ? (
                            <span className="inline-flex items-center gap-1 text-gray-500">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Enviando…
                            </span>
                          ) : res?.estado === 'ok' ? (
                            <span className="inline-flex items-center gap-1 text-[#027A48]">
                              <Check className="h-3 w-3" />
                              {res.comprobante ?? 'Enviado'}
                            </span>
                          ) : res?.estado === 'error' ? (
                            <span className="text-red-600" title={res.mensaje}>
                              Volvió a fallar
                            </span>
                          ) : !reenviable ? (
                            <span
                              className="text-gray-400"
                              title="Las NC y ND se rehacen desde el comprobante original"
                            >
                              No se reenvía
                            </span>
                          ) : null}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>

        {errorGlobal && (
          <div className="mx-6 mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorGlobal}
          </div>
        )}

        {(enviadasOk > 0 || volvieronAFallar > 0) && (
          <div className="mx-6 mb-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
            {enviadasOk > 0 && (
              <span className="font-semibold text-[#027A48]">{enviadasOk} enviado(s). </span>
            )}
            {volvieronAFallar > 0 && (
              <span className="font-semibold text-red-600">
                {volvieronAFallar} volvieron a fallar — pasá el mouse por el resultado para ver el
                motivo.
              </span>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-gray-200 p-6">
          <p className="text-xs text-gray-500">
            {seleccionados} seleccionado{seleccionados === 1 ? '' : 's'}
            {modificados > 0 && ` · ${modificados} socio(s) con cambios sin guardar`}
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={enviando}
              className="rounded-[10px] border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-[#101828] hover:bg-gray-50 disabled:opacity-60"
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={guardarYEnviar}
              disabled={enviando || (seleccionados === 0 && modificados === 0)}
              className="rounded-[10px] bg-[#175861] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0f4249] disabled:opacity-60"
            >
              {enviando
                ? 'Procesando…'
                : modificados > 0
                  ? `Guardar y reenviar (${seleccionados})`
                  : `Reenviar seleccionados (${seleccionados})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
