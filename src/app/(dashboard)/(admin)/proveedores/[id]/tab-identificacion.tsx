'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { actualizarIdentificacionAction, eliminarProveedorAction } from '@/app/actions/proveedores';
import {
  Campo,
  CatalogoMulti,
  CatalogoSelect,
  Selector,
  Tarjeta,
  botonPrimario,
  inputCls,
  useAccion,
} from '@/components/shared/form-ui';
import type { CatalogosDisponibles } from '@/lib/catalogos-club';
import { validarCuil } from '@/lib/legajo/validaciones';
import type { ProveedorDetalle } from '@/lib/proveedores/consultas';
import {
  CONDICIONES_IIBB,
  CONDICIONES_IVA,
  ESTADOS_PROVEEDOR,
  RETENCIONES,
  ROTULO_DOCUMENTO_FIJO,
  TIPOS_SUJETO,
} from '@/lib/proveedores/constantes';

import { AdjuntoFijo } from './adjunto-ui';

export function TabIdentificacion({
  det,
  catalogos,
}: {
  det: ProveedorDetalle;
  catalogos: CatalogosDisponibles;
}) {
  const p = det.proveedor;
  const router = useRouter();
  const { pending, ejecutar } = useAccion();
  const [f, setF] = useState({
    codigo: p.codigo,
    nombre: p.nombre,
    nombreComercial: p.nombreComercial ?? '',
    tipoSujeto: p.tipoSujeto ?? '',
    areaSector: p.areaSector ?? '',
    estado: p.estado,
    cuit: p.cuit ?? '',
    condicionIva: p.condicionIva ?? '',
    condicionIibb: p.condicionIibb ?? '',
    actividades: p.actividades,
    retenciones: p.retenciones,
    certificadoRetencion: p.certificadoRetencion,
    certRetDesde: p.certRetDesde ?? '',
    certRetHasta: p.certRetHasta ?? '',
    certRetPorcentaje: p.certRetPorcentaje ?? '',
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const exterior = f.condicionIva === 'proveedor_exterior';
  const cuit = !exterior && f.cuit.trim() !== '' ? validarCuil(f.cuit) : null;

  const guardar = () =>
    ejecutar(() => actualizarIdentificacionAction(p.id, f), 'Datos del proveedor guardados.');

  const botonGuardar = (
    <button type="button" className={botonPrimario} disabled={pending} onClick={guardar}>
      {pending ? 'Guardando…' : 'Guardar cambios'}
    </button>
  );

  return (
    <div className="space-y-6">
      <Tarjeta
        titulo="Datos de identificación"
        descripcion="Cómo figura el proveedor en el sistema."
        acciones={botonGuardar}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Campo
            label="Código de proveedor"
            requerido
            ayuda="Lo asigna el sistema (P-0001…); lo podés cambiar por el que uses."
          >
            <input
              className={inputCls}
              value={f.codigo}
              maxLength={30}
              onChange={(e) => set('codigo', e.target.value)}
            />
          </Campo>
          <Campo label="Estado" requerido>
            <Selector
              value={f.estado}
              onChange={(v) => set('estado', v)}
              opciones={ESTADOS_PROVEEDOR}
              placeholder="Elegí el estado"
            />
          </Campo>
          <Campo label="Razón social / nombre legal" requerido>
            <input
              className={inputCls}
              value={f.nombre}
              maxLength={150}
              onChange={(e) => set('nombre', e.target.value)}
            />
          </Campo>
          <Campo
            label="Nombre comercial"
            ayuda="Marca o nombre de fantasía: facilita la búsqueda interna."
          >
            <input
              className={inputCls}
              value={f.nombreComercial}
              maxLength={150}
              onChange={(e) => set('nombreComercial', e.target.value)}
            />
          </Campo>
          <Campo label="Tipo de sujeto">
            <Selector
              value={f.tipoSujeto}
              onChange={(v) => set('tipoSujeto', v)}
              opciones={TIPOS_SUJETO}
            />
          </Campo>
          <Campo label="Área o sector del proveedor" ayuda="Para buscarlo y filtrarlo.">
            <CatalogoSelect
              tipo="prov_area"
              value={f.areaSector}
              onChange={(v) => set('areaSector', v)}
              opciones={catalogos.prov_area}
            />
          </Campo>
        </div>
      </Tarjeta>

      <Tarjeta
        titulo="Información fiscal"
        descripcion="Los mismos datos impositivos que se cargan para un socio."
        acciones={botonGuardar}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Campo
            label={exterior ? 'Identificación fiscal (opcional)' : 'CUIT'}
            requerido={!exterior}
            ayuda={exterior ? undefined : 'Con o sin guiones. Se controla el dígito verificador.'}
          >
            <input
              className={inputCls}
              value={f.cuit}
              maxLength={20}
              onChange={(e) => set('cuit', e.target.value)}
            />
            {cuit && !cuit.ok && <p className="mt-1 text-xs text-red-600">{cuit.error}</p>}
            {cuit?.ok && <p className="mt-1 text-xs text-[#175861]">CUIT válido.</p>}
          </Campo>
          <Campo label="Condición frente al IVA">
            <Selector
              value={f.condicionIva}
              onChange={(v) => set('condicionIva', v)}
              opciones={CONDICIONES_IVA}
            />
          </Campo>
          <Campo label="Ingresos Brutos">
            <Selector
              value={f.condicionIibb}
              onChange={(v) => set('condicionIibb', v)}
              opciones={CONDICIONES_IIBB}
            />
          </Campo>
          <Campo label="Actividad principal" ayuda="Podés elegir más de una.">
            <CatalogoMulti
              tipo="prov_actividad"
              value={f.actividades}
              onChange={(v) => set('actividades', v)}
              opciones={catalogos.prov_actividad}
              placeholder="Elegí una actividad"
            />
          </Campo>

          <div className="md:col-span-2">
            <p className="mb-2 text-sm font-medium text-gray-700">Legajo impositivo</p>
            <AdjuntoFijo
              proveedorId={p.id}
              clave="legajo_impositivo"
              rotulo={ROTULO_DOCUMENTO_FIJO.legajo_impositivo}
              adjunto={det.adjuntosFijos['legajo_impositivo']}
            />
          </div>

          <Campo
            label="Indicador de retención"
            ayuda="Impuestos que se le retienen al pagarle. Sin ninguno tildado, no se le retiene."
            className="md:col-span-2"
          >
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {RETENCIONES.map((r) => (
                <label key={r.value} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 cursor-pointer rounded accent-[#175861]"
                    checked={f.retenciones.includes(r.value)}
                    onChange={(e) =>
                      set(
                        'retenciones',
                        e.target.checked
                          ? [...f.retenciones, r.value]
                          : f.retenciones.filter((x) => x !== r.value),
                      )
                    }
                  />
                  <span className="text-sm text-gray-700">{r.label}</span>
                </label>
              ))}
            </div>
          </Campo>

          <div className="md:col-span-2">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 cursor-pointer rounded accent-[#175861]"
                checked={f.certificadoRetencion}
                onChange={(e) => set('certificadoRetencion', e.target.checked)}
              />
              <span className="text-sm font-medium text-gray-800">
                Tiene certificado de exclusión de retenciones
              </span>
            </label>
            {f.certificadoRetencion && (
              <div className="mt-3 grid grid-cols-1 gap-4 rounded-[10px] border border-gray-200 bg-gray-50/60 p-4 md:grid-cols-3">
                <Campo label="Vigente desde" requerido>
                  <input
                    type="date"
                    className={inputCls}
                    value={f.certRetDesde}
                    onChange={(e) => set('certRetDesde', e.target.value)}
                  />
                </Campo>
                <Campo label="Vigente hasta" requerido>
                  <input
                    type="date"
                    className={inputCls}
                    value={f.certRetHasta}
                    onChange={(e) => set('certRetHasta', e.target.value)}
                  />
                </Campo>
                <Campo label="% de exclusión" requerido ayuda="De 0 a 100.">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    className={inputCls}
                    value={f.certRetPorcentaje}
                    onChange={(e) => set('certRetPorcentaje', e.target.value)}
                  />
                </Campo>
                <div className="md:col-span-3">
                  <AdjuntoFijo
                    proveedorId={p.id}
                    clave="cert_retencion"
                    rotulo={ROTULO_DOCUMENTO_FIJO.cert_retencion}
                    adjunto={det.adjuntosFijos['cert_retencion']}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </Tarjeta>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 md:p-6">
        <h2 className="text-base font-bold" style={{ color: '#101828' }}>
          Eliminar proveedor
        </h2>
        <p className="mt-0.5 text-sm text-gray-500">
          Para un proveedor cargado por error. Si ya tiene reparaciones registradas, pasalo a
          Inactivo en lugar de eliminarlo.
        </p>
        <button
          type="button"
          disabled={pending}
          className="mt-3 rounded-[10px] border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
          onClick={() => {
            if (
              window.confirm(
                `¿Eliminar a ${p.nombre}? Se borran también sus cuentas y documentos. No se puede deshacer.`,
              )
            ) {
              ejecutar(
                () => eliminarProveedorAction(p.id),
                'Proveedor eliminado.',
                () => router.push('/proveedores'),
              );
            }
          }}
        >
          Eliminar proveedor
        </button>
      </section>
    </div>
  );
}
