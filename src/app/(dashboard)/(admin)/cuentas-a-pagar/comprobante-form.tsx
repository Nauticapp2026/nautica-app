'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { crearComprobanteAction, editarComprobanteAction } from '@/app/actions/cuentas-a-pagar';
import {
  Campo,
  CatalogoSelect,
  Selector,
  Tarjeta,
  botonPrimario,
  botonSecundario,
  inputCls,
  textareaCls,
} from '@/components/shared/form-ui';
import { ProveedorSelect } from '@/components/shared/proveedor-selector';
import { calcularTotales, ivaDeLinea, parseImporte } from '@/lib/cuentas-a-pagar/calculos';
import {
  ALICUOTAS_IVA,
  MONEDAS_CP,
  OPCIONES_TIPO_COMPROBANTE,
  esTipoC,
  formatoImporte,
  formatoMoneda,
  vencimientoSegunCondicion,
} from '@/lib/cuentas-a-pagar/constantes';
import type { DetalleComprobante, ProveedorSelector } from '@/lib/cuentas-a-pagar/consultas';
import { labelDe } from '@/lib/legajo/constantes';
import { CONDICIONES_IVA, PROVINCIAS } from '@/lib/proveedores/constantes';

type LineaIvaForm = { neto: string; alicuota: number; iva: string };
type PercepcionForm = { jurisdiccion: string; monto: string };

const txt = (n: number): string => (n ? String(n).replace('.', ',') : '');

export type CatalogosComprobante = {
  condicionesPago: string[];
  formasPago: string[];
  cuentasContables: string[];
};

/**
 * Alta y modificación de un comprobante de Cuentas a pagar. El total se muestra en vivo, pero
 * el servidor lo recalcula y valida todo de nuevo.
 */
export function ComprobanteForm({
  proveedores,
  catalogos,
  hoy,
  inicial,
  onCancelar,
}: {
  proveedores: ProveedorSelector[];
  catalogos: CatalogosComprobante;
  hoy: string;
  inicial?: DetalleComprobante;
  onCancelar?: () => void;
}) {
  const router = useRouter();
  const [guardando, setGuardando] = useState(false);

  const [proveedorId, setProveedorId] = useState(inicial?.proveedorId ?? '');
  const [fechaEmision, setFechaEmision] = useState(inicial?.fechaEmision ?? hoy);
  const [tipo, setTipo] = useState(inicial?.tipoComprobante ?? '');
  const [puntoVenta, setPuntoVenta] = useState(inicial?.puntoVenta ?? '');
  const [numeroComprobante, setNumeroComprobante] = useState(inicial?.numeroComprobante ?? '');
  const [condicionPago, setCondicionPago] = useState(inicial?.condicionPago ?? '');
  const [vencimiento, setVencimiento] = useState(inicial?.fechaVencimiento ?? '');
  const [vencManual, setVencManual] = useState(!!inicial);
  const [moneda, setMoneda] = useState(inicial?.moneda ?? 'PES');
  const [tipoCambio, setTipoCambio] = useState(inicial?.tipoCambio ? txt(inicial.tipoCambio) : '');
  const [concepto, setConcepto] = useState(inicial?.concepto ?? '');
  const [instrumento, setInstrumento] = useState(inicial?.instrumentoPago ?? '');
  const [lineasIva, setLineasIva] = useState<LineaIvaForm[]>(
    inicial && inicial.lineasIva.length > 0
      ? inicial.lineasIva.map((l) => ({
          neto: txt(l.neto),
          alicuota: l.alicuota,
          iva: txt(l.iva),
        }))
      : [{ neto: '', alicuota: 21, iva: '' }],
  );
  const [netoNoGravado, setNetoNoGravado] = useState(txt(inicial?.netoNoGravado ?? 0));
  const [exento, setExento] = useState(txt(inicial?.exento ?? 0));
  const [otros, setOtros] = useState(txt(inicial?.otrosTributos ?? 0));
  const [percepciones, setPercepciones] = useState<PercepcionForm[]>(
    (inicial?.percepcionesIibb ?? []).map((p) => ({
      jurisdiccion: p.jurisdiccion,
      monto: txt(p.monto),
    })),
  );
  const [monotributo, setMonotributo] = useState(txt(inicial?.monotributo ?? 0));
  const [observaciones, setObservaciones] = useState(inicial?.observaciones ?? '');
  const [archivo, setArchivo] = useState<File | null>(null);

  const proveedor = proveedores.find((p) => p.id === proveedorId) ?? null;
  const esC = esTipoC(tipo);
  const dolares = moneda === 'DOL';

  // Totales en vivo (los mismos que recalcula el servidor).
  const totales = useMemo(
    () =>
      calcularTotales(tipo, {
        lineasIva: lineasIva.map((l) => ({
          neto: parseImporte(l.neto),
          alicuota: l.alicuota,
          iva: parseImporte(l.iva),
        })),
        netoNoGravado: parseImporte(netoNoGravado),
        exento: parseImporte(exento),
        otrosTributos: parseImporte(otros),
        percepcionesIibb: percepciones.map((p) => ({
          jurisdiccion: p.jurisdiccion,
          monto: parseImporte(p.monto),
        })),
        monotributo: parseImporte(monotributo),
      }),
    [tipo, lineasIva, netoNoGravado, exento, otros, percepciones, monotributo],
  );

  function elegirProveedor(p: ProveedorSelector | null) {
    setProveedorId(p?.id ?? '');
    if (!p) return;
    // Lo que trae del Maestro de Proveedores; se puede cambiar a mano.
    if (p.condicionPago) cambiarCondicion(p.condicionPago, fechaEmision, false);
    if (p.formaPago) setInstrumento(p.formaPago);
    if (p.cuentasContables[0]) setConcepto(p.cuentasContables[0]);
    setMoneda(p.moneda === 'USD' ? 'DOL' : 'PES');
  }

  function cambiarCondicion(cond: string, emision: string, forzar: boolean) {
    setCondicionPago(cond);
    if (forzar) setVencManual(false);
    if (forzar || !vencManual) {
      const v = vencimientoSegunCondicion(emision, cond);
      if (v) setVencimiento(v);
    }
  }

  function cambiarEmision(v: string) {
    setFechaEmision(v);
    if (!vencManual) {
      const venc = vencimientoSegunCondicion(v, condicionPago);
      if (venc) setVencimiento(venc);
    }
  }

  function cambiarLinea(i: number, cambios: Partial<LineaIvaForm>) {
    setLineasIva((ls) =>
      ls.map((l, k) => {
        if (k !== i) return l;
        const nueva = { ...l, ...cambios };
        // El IVA se calcula solo al cambiar el neto o la alícuota; después se puede corregir.
        if ('neto' in cambios || 'alicuota' in cambios) {
          const iva = ivaDeLinea(parseImporte(nueva.neto), nueva.alicuota);
          nueva.iva = iva ? txt(iva) : '';
        }
        return nueva;
      }),
    );
  }

  async function guardar() {
    if (!proveedorId) return void toast.error('Elegí el proveedor.');
    const payload = {
      proveedorId,
      fechaEmision,
      tipoComprobante: tipo,
      puntoVenta,
      numeroComprobante,
      fechaVencimiento: vencimiento,
      condicionPago,
      moneda,
      tipoCambio: dolares ? parseImporte(tipoCambio) || null : null,
      concepto,
      instrumentoPago: instrumento,
      lineasIva: lineasIva
        .filter((l) => parseImporte(l.neto) > 0 || parseImporte(l.iva) > 0)
        .map((l) => ({
          neto: parseImporte(l.neto),
          alicuota: l.alicuota,
          iva: parseImporte(l.iva),
        })),
      netoNoGravado: parseImporte(netoNoGravado),
      exento: parseImporte(exento),
      otrosTributos: parseImporte(otros),
      percepcionesIibb: percepciones
        .filter((p) => p.jurisdiccion || parseImporte(p.monto) > 0)
        .map((p) => ({ jurisdiccion: p.jurisdiccion, monto: parseImporte(p.monto) })),
      monotributo: parseImporte(monotributo),
      observaciones,
    };
    const fd = new FormData();
    fd.set('payload', JSON.stringify(payload));
    if (archivo) fd.set('adjunto', archivo);

    setGuardando(true);
    try {
      const res = inicial
        ? await editarComprobanteAction(inicial.id, fd)
        : await crearComprobanteAction(fd);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(
        inicial ? 'Comprobante modificado.' : `Comprobante ${res.codigo} cargado (estado H).`,
      );
      if (inicial) {
        onCancelar?.();
        router.refresh();
      } else {
        router.push(`/cuentas-a-pagar/${res.id}`);
      }
    } finally {
      setGuardando(false);
    }
  }

  const deshabilitaImportes = esC; // en un comprobante C solo se carga el monotributo
  const gris = 'disabled:bg-gray-100';

  return (
    <div className="space-y-6">
      <Tarjeta
        titulo="Proveedor"
        descripcion="Solo se puede cargar con proveedores del Maestro de Proveedores."
      >
        <div className="space-y-4">
          <Campo label="Nro. de proveedor" requerido>
            <ProveedorSelect
              proveedores={proveedores}
              value={proveedorId}
              onChange={elegirProveedor}
            />
          </Campo>
          {proveedor && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Campo label="Razón social">
                <input className={inputCls} value={proveedor.nombre} disabled readOnly />
              </Campo>
              <Campo label="CUIT">
                <input className={inputCls} value={proveedor.cuit ?? '—'} disabled readOnly />
              </Campo>
              <Campo label="Condición ante el IVA">
                <input
                  className={inputCls}
                  value={labelDe(CONDICIONES_IVA, proveedor.condicionIva) || 'Sin cargar'}
                  disabled
                  readOnly
                />
              </Campo>
            </div>
          )}
        </div>
      </Tarjeta>

      <Tarjeta titulo="Datos del comprobante">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Campo label="Fecha de emisión" requerido>
            <input
              type="date"
              className={inputCls}
              value={fechaEmision}
              max={hoy}
              onChange={(e) => cambiarEmision(e.target.value)}
            />
          </Campo>
          <Campo label="Tipo de comprobante" requerido className="lg:col-span-2">
            <Selector
              value={tipo}
              onChange={setTipo}
              opciones={OPCIONES_TIPO_COMPROBANTE}
              placeholder="Elegí el tipo (ej. Factura A – 001)"
            />
          </Campo>
          <Campo label="Fecha de contabilización" ayuda="Se completa sola con la fecha de hoy.">
            <input
              type="date"
              className={inputCls}
              value={inicial?.fechaContabilizacion ?? hoy}
              disabled
              readOnly
            />
          </Campo>
          <Campo label="Punto de venta" requerido ayuda="Hasta 5 dígitos (ej. 00005)">
            <input
              className={inputCls}
              inputMode="numeric"
              maxLength={5}
              placeholder="00005"
              value={puntoVenta}
              onChange={(e) => setPuntoVenta(e.target.value.replace(/\D/g, ''))}
              onBlur={() => puntoVenta && setPuntoVenta(puntoVenta.padStart(5, '0'))}
            />
          </Campo>
          <Campo label="Número de comprobante" requerido ayuda="Hasta 8 dígitos (ej. 00001234)">
            <input
              className={inputCls}
              inputMode="numeric"
              maxLength={8}
              placeholder="00001234"
              value={numeroComprobante}
              onChange={(e) => setNumeroComprobante(e.target.value.replace(/\D/g, ''))}
              onBlur={() =>
                numeroComprobante && setNumeroComprobante(numeroComprobante.padStart(8, '0'))
              }
            />
          </Campo>
          <Campo label="Condición de pago" requerido ayuda="Viene del proveedor; podés cambiarla.">
            <CatalogoSelect
              tipo="prov_condicion_pago"
              value={condicionPago}
              onChange={(v) => cambiarCondicion(v, fechaEmision, true)}
              opciones={catalogos.condicionesPago}
            />
          </Campo>
          <Campo
            label="Fecha de vencimiento"
            requerido
            ayuda="Se calcula según la condición de pago."
          >
            <input
              type="date"
              className={inputCls}
              value={vencimiento}
              min={fechaEmision}
              onChange={(e) => {
                setVencimiento(e.target.value);
                setVencManual(true);
              }}
            />
          </Campo>
          <Campo label="Moneda del comprobante" requerido>
            <Selector value={moneda} onChange={setMoneda} opciones={MONEDAS_CP} />
          </Campo>
          <Campo label="Tipo de cambio" requerido={dolares}>
            <input
              className={`${inputCls} ${gris}`}
              inputMode="decimal"
              placeholder="0,00"
              value={dolares ? tipoCambio : ''}
              disabled={!dolares}
              onChange={(e) => setTipoCambio(e.target.value)}
            />
          </Campo>
          <Campo
            label="Concepto (imputación contable)"
            requerido
            ayuda="Viene de los datos contables del proveedor."
          >
            <CatalogoSelect
              tipo="prov_cuenta_contable"
              value={concepto}
              onChange={setConcepto}
              opciones={catalogos.cuentasContables}
            />
          </Campo>
          <Campo
            label="Instrumento de pago"
            requerido
            ayuda="Viene del proveedor; podés cambiarlo."
          >
            <CatalogoSelect
              tipo="prov_forma_pago"
              value={instrumento}
              onChange={setInstrumento}
              opciones={catalogos.formasPago}
            />
          </Campo>
        </div>
      </Tarjeta>

      <Tarjeta
        titulo="Apertura de importes"
        descripcion={
          esC
            ? 'En las facturas, notas de crédito y notas de débito C solo se carga el monto de monotributo.'
            : 'El monotributo solo se habilita en comprobantes tipo C. Las notas de crédito se cargan en positivo.'
        }
      >
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">
              Importe neto gravado, alícuota e IVA liquidado
            </p>
            <div className="space-y-2">
              {lineasIva.map((l, i) => (
                <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_9rem_1fr_auto]">
                  <input
                    className={`${inputCls} ${gris}`}
                    inputMode="decimal"
                    placeholder="Neto gravado"
                    aria-label="Importe neto gravado"
                    value={l.neto}
                    disabled={deshabilitaImportes}
                    onChange={(e) => cambiarLinea(i, { neto: e.target.value })}
                  />
                  <select
                    className={`${inputCls} ${gris}`}
                    aria-label="Alícuota de IVA"
                    value={l.alicuota}
                    disabled={deshabilitaImportes}
                    onChange={(e) => cambiarLinea(i, { alicuota: Number(e.target.value) })}
                  >
                    {ALICUOTAS_IVA.map((a) => (
                      <option key={a} value={a}>
                        {String(a).replace('.', ',')} %
                      </option>
                    ))}
                  </select>
                  <input
                    className={`${inputCls} ${gris}`}
                    inputMode="decimal"
                    placeholder="IVA liquidado"
                    aria-label="Impuesto liquidado (IVA)"
                    value={l.iva}
                    disabled={deshabilitaImportes}
                    onChange={(e) => cambiarLinea(i, { iva: e.target.value })}
                  />
                  <button
                    type="button"
                    aria-label="Quitar línea"
                    className="h-10 justify-self-end rounded-md p-2 text-gray-400 hover:bg-gray-100 disabled:opacity-40"
                    disabled={deshabilitaImportes || lineasIva.length === 1}
                    onClick={() => setLineasIva((ls) => ls.filter((_, k) => k !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-[#175861] hover:underline disabled:opacity-40"
              disabled={deshabilitaImportes}
              onClick={() => setLineasIva((ls) => [...ls, { neto: '', alicuota: 21, iva: '' }])}
            >
              <Plus className="h-4 w-4" />
              Agregar otra alícuota
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Campo label="Importe neto no gravado">
              <input
                className={`${inputCls} ${gris}`}
                inputMode="decimal"
                placeholder="0,00"
                value={netoNoGravado}
                disabled={deshabilitaImportes}
                onChange={(e) => setNetoNoGravado(e.target.value)}
              />
            </Campo>
            <Campo label="Importe de operaciones exentas">
              <input
                className={`${inputCls} ${gris}`}
                inputMode="decimal"
                placeholder="0,00"
                value={exento}
                disabled={deshabilitaImportes}
                onChange={(e) => setExento(e.target.value)}
              />
            </Campo>
            <Campo label="Impuestos internos / otros tributos">
              <input
                className={`${inputCls} ${gris}`}
                inputMode="decimal"
                placeholder="0,00"
                value={otros}
                disabled={deshabilitaImportes}
                onChange={(e) => setOtros(e.target.value)}
              />
            </Campo>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">
              Percepciones de Ingresos Brutos
            </p>
            <div className="space-y-2">
              {percepciones.map((p, i) => (
                <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <select
                    className={`${inputCls} ${gris}`}
                    aria-label="Jurisdicción de la percepción"
                    value={p.jurisdiccion}
                    disabled={deshabilitaImportes}
                    onChange={(e) =>
                      setPercepciones((ps) =>
                        ps.map((x, k) => (k === i ? { ...x, jurisdiccion: e.target.value } : x)),
                      )
                    }
                  >
                    <option value="">Elegí la jurisdicción</option>
                    {PROVINCIAS.map((pr) => (
                      <option key={pr.value} value={pr.value}>
                        {pr.label}
                      </option>
                    ))}
                  </select>
                  <input
                    className={`${inputCls} ${gris}`}
                    inputMode="decimal"
                    placeholder="Monto"
                    aria-label="Monto de la percepción"
                    value={p.monto}
                    disabled={deshabilitaImportes}
                    onChange={(e) =>
                      setPercepciones((ps) =>
                        ps.map((x, k) => (k === i ? { ...x, monto: e.target.value } : x)),
                      )
                    }
                  />
                  <button
                    type="button"
                    aria-label="Quitar percepción"
                    className="h-10 justify-self-end rounded-md p-2 text-gray-400 hover:bg-gray-100"
                    onClick={() => setPercepciones((ps) => ps.filter((_, k) => k !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-[#175861] hover:underline disabled:opacity-40"
              disabled={deshabilitaImportes}
              onClick={() => setPercepciones((ps) => [...ps, { jurisdiccion: '', monto: '' }])}
            >
              <Plus className="h-4 w-4" />
              Agregar percepción
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Campo label="Monotributo" ayuda="Solo en facturas, notas de crédito y de débito C.">
              <input
                className={`${inputCls} ${gris}`}
                inputMode="decimal"
                placeholder="0,00"
                value={esC ? monotributo : ''}
                disabled={!esC}
                onChange={(e) => setMonotributo(e.target.value)}
              />
            </Campo>
          </div>

          <div className="rounded-xl bg-gray-50 p-4">
            <dl className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
              <Linea rotulo="Neto gravado" valor={formatoImporte(totales.netoGravado)} />
              <Linea rotulo="IVA" valor={formatoImporte(totales.iva)} />
              <Linea
                rotulo="Neto no gravado y exento"
                valor={formatoImporte(totales.netoNoGravado + totales.exento)}
              />
              <Linea rotulo="Otros tributos" valor={formatoImporte(totales.otrosTributos)} />
              <Linea
                rotulo="Percepciones IIBB"
                valor={formatoImporte(totales.percepcionesIibbTotal)}
              />
              <Linea rotulo="Monotributo" valor={formatoImporte(totales.monotributo)} />
            </dl>
            <p className="mt-3 flex items-baseline justify-between border-t border-gray-200 pt-3 text-base font-bold text-gray-900">
              <span>Importe total</span>
              <span>{formatoMoneda(totales.total, moneda)}</span>
            </p>
          </div>
        </div>
      </Tarjeta>

      <Tarjeta titulo="Adjunto y observaciones">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            label="Adjuntar comprobante"
            ayuda={
              inicial?.adjuntoNombre
                ? `Ya hay un archivo (${inicial.adjuntoNombre}). Si elegís otro, lo reemplaza. PDF, JPG, PNG o WebP de hasta 8 MB.`
                : 'Opcional: también se puede adjuntar después. PDF, JPG, PNG o WebP de hasta 8 MB.'
            }
          >
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-medium"
              onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            />
          </Campo>
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
          onClick={() => (onCancelar ? onCancelar() : router.push('/cuentas-a-pagar'))}
        >
          Cancelar
        </button>
        <button type="button" className={botonPrimario} disabled={guardando} onClick={guardar}>
          {guardando ? 'Guardando…' : inicial ? 'Guardar cambios' : 'Cargar comprobante'}
        </button>
      </div>
    </div>
  );
}

function Linea({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-gray-500">{rotulo}</dt>
      <dd className="font-medium text-gray-900">{valor}</dd>
    </div>
  );
}
