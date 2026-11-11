'use client';

import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';

import {
  actualizarContableAction,
  eliminarCuentaBancariaAction,
  guardarCuentaBancariaAction,
} from '@/app/actions/proveedores';
import {
  Campo,
  CatalogoMulti,
  CatalogoSelect,
  Selector,
  Tarjeta,
  botonPrimario,
  botonSecundario,
  inputCls,
  useAccion,
} from '@/components/shared/form-ui';
import type { CatalogosDisponibles } from '@/lib/catalogos-club';
import { TIPOS_CUENTA, labelDe } from '@/lib/legajo/constantes';
import { validarCbu } from '@/lib/legajo/validaciones';
import type { ProveedorDetalle } from '@/lib/proveedores/consultas';
import { MONEDAS } from '@/lib/proveedores/constantes';

type Cuenta = ProveedorDetalle['cuentas'][number];

export function TabContable({
  det,
  catalogos,
}: {
  det: ProveedorDetalle;
  catalogos: CatalogosDisponibles;
}) {
  return (
    <div className="space-y-6">
      <ConfiguracionContable det={det} catalogos={catalogos} />
      <CuentasBancarias det={det} catalogos={catalogos} />
    </div>
  );
}

function ConfiguracionContable({
  det,
  catalogos,
}: {
  det: ProveedorDetalle;
  catalogos: CatalogosDisponibles;
}) {
  const p = det.proveedor;
  const { pending, ejecutar } = useAccion();
  const [f, setF] = useState({
    cuentasContables: p.cuentasContables,
    moneda: p.moneda,
    condicionPago: p.condicionPago ?? '',
    formaPago: p.formaPago ?? '',
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  return (
    <Tarjeta
      titulo="Configuración contable y financiera"
      acciones={
        <button
          type="button"
          className={botonPrimario}
          disabled={pending}
          onClick={() => ejecutar(() => actualizarContableAction(p.id, f), 'Datos guardados.')}
        >
          {pending ? 'Guardando…' : 'Guardar cambios'}
        </button>
      }
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Campo
          label="Cuenta contable asociada"
          ayuda="Concepto contable al que se imputan sus compras. Podés elegir más de una."
          className="md:col-span-2"
        >
          <CatalogoMulti
            tipo="prov_cuenta_contable"
            value={f.cuentasContables}
            onChange={(v) => set('cuentasContables', v)}
            opciones={catalogos.prov_cuenta_contable}
            placeholder="Elegí una cuenta"
          />
        </Campo>
        <Campo label="Moneda predeterminada">
          <Selector
            value={f.moneda}
            onChange={(v) => set('moneda', v)}
            opciones={MONEDAS}
            placeholder="Elegí la moneda"
          />
        </Campo>
        <Campo label="Condiciones de pago" ayuda="Plazo acordado para las compras a crédito.">
          <CatalogoSelect
            tipo="prov_condicion_pago"
            value={f.condicionPago}
            onChange={(v) => set('condicionPago', v)}
            opciones={catalogos.prov_condicion_pago}
          />
        </Campo>
        <Campo label="Método / forma de pago preferida">
          <CatalogoSelect
            tipo="prov_forma_pago"
            value={f.formaPago}
            onChange={(v) => set('formaPago', v)}
            opciones={catalogos.prov_forma_pago}
          />
        </Campo>
      </div>
    </Tarjeta>
  );
}

const CUENTA_VACIA = {
  banco: '',
  tipoCuenta: '',
  nroCuenta: '',
  cbu: '',
  alias: '',
  titular: '',
  observaciones: '',
};

function CuentasBancarias({
  det,
  catalogos,
}: {
  det: ProveedorDetalle;
  catalogos: CatalogosDisponibles;
}) {
  const proveedorId = det.proveedor.id;
  const { pending, ejecutar } = useAccion();
  /** null = formulario cerrado; '' = alta; un id = edición. */
  const [editando, setEditando] = useState<string | null>(null);
  const [f, setF] = useState(CUENTA_VACIA);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const cbu = f.cbu.trim() === '' ? null : validarCbu(f.cbu);

  function abrir(c?: Cuenta) {
    setF(
      c
        ? {
            banco: c.banco ?? '',
            tipoCuenta: c.tipoCuenta ?? '',
            nroCuenta: c.nroCuenta ?? '',
            cbu: c.cbu ?? '',
            alias: c.alias ?? '',
            titular: c.titular ?? '',
            observaciones: c.observaciones ?? '',
          }
        : CUENTA_VACIA,
    );
    setEditando(c?.id ?? '');
  }

  return (
    <Tarjeta
      titulo="Datos bancarios"
      descripcion="Podés cargar varias cuentas para el mismo proveedor."
      acciones={
        editando === null && (
          <button type="button" className={botonSecundario} onClick={() => abrir()}>
            <span className="inline-flex items-center gap-1.5">
              <Plus className="h-4 w-4" />
              Agregar cuenta
            </span>
          </button>
        )
      }
    >
      {editando !== null && (
        <div className="mb-4 rounded-[10px] border border-gray-200 bg-gray-50/60 p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Campo label="Banco">
              <CatalogoSelect
                tipo="banco"
                value={f.banco}
                onChange={(v) => set('banco', v)}
                opciones={catalogos.banco}
              />
            </Campo>
            <Campo label="Tipo de cuenta">
              <Selector
                value={f.tipoCuenta}
                onChange={(v) => set('tipoCuenta', v)}
                opciones={TIPOS_CUENTA}
              />
            </Campo>
            <Campo
              label="CBU"
              ayuda="22 dígitos. Se controlan los dígitos verificadores."
              className="md:col-span-2"
            >
              <input
                className={inputCls}
                value={f.cbu}
                maxLength={30}
                inputMode="numeric"
                placeholder="0000000000000000000000"
                onChange={(e) => set('cbu', e.target.value)}
              />
              {cbu && !cbu.ok && <p className="mt-1 text-xs text-red-600">{cbu.error}</p>}
              {cbu?.ok && <p className="mt-1 text-xs text-[#175861]">CBU válido.</p>}
            </Campo>
            <Campo label="Alias" ayuda="De 6 a 20 caracteres: letras, números, puntos o guiones.">
              <input
                className={inputCls}
                value={f.alias}
                maxLength={20}
                onChange={(e) => set('alias', e.target.value)}
              />
            </Campo>
            <Campo label="Nº de cuenta">
              <input
                className={inputCls}
                value={f.nroCuenta}
                maxLength={40}
                onChange={(e) => set('nroCuenta', e.target.value)}
              />
            </Campo>
            <Campo label="Titular">
              <input
                className={inputCls}
                value={f.titular}
                maxLength={120}
                onChange={(e) => set('titular', e.target.value)}
              />
            </Campo>
            <Campo label="Observaciones">
              <input
                className={inputCls}
                value={f.observaciones}
                maxLength={300}
                onChange={(e) => set('observaciones', e.target.value)}
              />
            </Campo>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className={botonSecundario} onClick={() => setEditando(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className={botonPrimario}
              disabled={pending}
              onClick={() =>
                ejecutar(
                  () =>
                    guardarCuentaBancariaAction(proveedorId, { ...f, id: editando || undefined }),
                  editando ? 'Cuenta actualizada.' : 'Cuenta agregada.',
                  () => setEditando(null),
                )
              }
            >
              {pending ? 'Guardando…' : 'Guardar cuenta'}
            </button>
          </div>
        </div>
      )}

      {det.cuentas.length === 0 ? (
        <p className="text-sm text-gray-500">Todavía no hay cuentas bancarias cargadas.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {det.cuentas.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900">
                  {c.banco ?? 'Cuenta'}
                  {c.tipoCuenta && (
                    <span className="font-normal text-gray-500">
                      {' '}
                      · {labelDe(TIPOS_CUENTA, c.tipoCuenta)}
                    </span>
                  )}
                </p>
                <p className="text-xs break-all text-gray-500">
                  {[
                    c.cbu && `CBU ${c.cbu}`,
                    c.alias && `Alias ${c.alias}`,
                    c.nroCuenta && `Cuenta ${c.nroCuenta}`,
                    c.titular && `Titular ${c.titular}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <button
                type="button"
                aria-label="Editar"
                className="rounded-[8px] p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                onClick={() => abrir(c)}
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Eliminar"
                disabled={pending}
                className="rounded-[8px] p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
                onClick={() => {
                  if (window.confirm('¿Quitar esta cuenta bancaria?')) {
                    ejecutar(
                      () => eliminarCuentaBancariaAction(proveedorId, c.id),
                      'Cuenta quitada.',
                    );
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}
