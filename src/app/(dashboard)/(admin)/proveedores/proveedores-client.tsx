'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Plus, Search, Truck, X } from 'lucide-react';

import { crearProveedorAction } from '@/app/actions/proveedores';
import { EmptyState } from '@/components/shared/empty-state';
import { ExportarMenu } from '@/components/shared/exportar-menu';
import {
  Campo,
  botonPrimario,
  botonSecundario,
  inputCls,
  useAccion,
} from '@/components/shared/form-ui';
import { normalizarBusqueda } from '@/lib/buscador';
import { exportarTabla, type FormatoExportacion } from '@/lib/exportar-tabla';
import { labelDe } from '@/lib/legajo/constantes';
import { validarCuil } from '@/lib/legajo/validaciones';
import type { FilaProveedor } from '@/lib/proveedores/consultas';
import { CONDICIONES_IVA, ESTADOS_PROVEEDOR, TIPOS_SUJETO } from '@/lib/proveedores/constantes';

export function ProveedoresClient({ filas, areas }: { filas: FilaProveedor[]; areas: string[] }) {
  const [creando, setCreando] = useState(false);
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState('');
  const [area, setArea] = useState('');

  const visibles = useMemo(() => {
    const n = normalizarBusqueda(q);
    return filas.filter((f) => {
      if (estado && f.estado !== estado) return false;
      if (area && f.areaSector !== area) return false;
      if (!n) return true;
      return normalizarBusqueda(
        `${f.codigo} ${f.nombre} ${f.nombreComercial ?? ''} ${f.cuit ?? ''} ${f.areaSector ?? ''}`,
      ).includes(n);
    });
  }, [filas, q, estado, area]);

  // Las áreas del filtro: las sugeridas que realmente usa algún proveedor.
  const areasUsadas = useMemo(
    () => areas.filter((a) => filas.some((f) => f.areaSector === a)),
    [areas, filas],
  );

  const exportar = (formato: FormatoExportacion) =>
    exportarTabla(formato, {
      nombre: 'proveedores',
      titulo: 'Proveedores',
      columnas: [
        'Código',
        'Razón social',
        'Nombre comercial',
        'Tipo de sujeto',
        'Área',
        'CUIT',
        'Condición IVA',
        'Estado',
        'Teléfono',
        'Email de facturación',
        'Ciudad',
        'Provincia',
        'Requisitos pendientes',
      ],
      filas: visibles.map((f) => [
        f.codigo,
        f.nombre,
        f.nombreComercial ?? '',
        labelDe(TIPOS_SUJETO, f.tipoSujeto),
        f.areaSector ?? '',
        f.cuit ?? '',
        labelDe(CONDICIONES_IVA, f.condicionIva),
        labelDe(ESTADOS_PROVEEDOR, f.estado),
        f.telefono ?? '',
        f.email ?? '',
        f.ciudad ?? '',
        f.provincia ?? '',
        String(f.requisitosPendientes),
      ]),
    });

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="page-title">Proveedores</h1>
          <p className="page-subtitle mt-1">Maestro de proveedores del club</p>
        </div>
        <button type="button" className={botonPrimario} onClick={() => setCreando(true)}>
          <span className="inline-flex items-center gap-1.5">
            <Plus className="h-4 w-4" />
            Nuevo proveedor
          </span>
        </button>
      </div>

      {filas.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white">
          <EmptyState
            icon={<Truck className="h-6 w-6 text-gray-400" />}
            text="Todavía no hay proveedores cargados."
            description="Con “Nuevo proveedor” cargás la razón social y el CUIT; el resto de los datos es opcional y se completa cuando lo necesites."
          />
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-gray-100 p-4 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                className={`${inputCls} pl-9`}
                placeholder="Buscar por código, razón social, nombre comercial o CUIT"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <select
              className={`${inputCls} lg:!w-48`}
              value={estado}
              onChange={(e) => setEstado(e.target.value)}
            >
              <option value="">Todos los estados</option>
              {ESTADOS_PROVEEDOR.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.label}
                </option>
              ))}
            </select>
            <select
              className={`${inputCls} lg:!w-56`}
              value={area}
              onChange={(e) => setArea(e.target.value)}
            >
              <option value="">Todas las áreas</option>
              {areasUsadas.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <ExportarMenu
              onExportar={exportar}
              disabled={visibles.length === 0}
              className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-gray-200 bg-white px-4 text-sm font-medium whitespace-nowrap text-gray-700 hover:bg-gray-50"
            />
          </div>

          {visibles.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-500">
              No hay proveedores que coincidan con la búsqueda.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs tracking-wide text-gray-500 uppercase">
                    <th className="px-4 py-3 font-semibold">Código</th>
                    <th className="px-4 py-3 font-semibold">Razón social</th>
                    <th className="px-4 py-3 font-semibold">CUIT</th>
                    <th className="px-4 py-3 font-semibold">Área</th>
                    <th className="px-4 py-3 font-semibold">Teléfono</th>
                    <th className="px-4 py-3 font-semibold">Estado</th>
                    <th className="px-4 py-3 font-semibold">Documentación</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((f) => {
                    const est = ESTADOS_PROVEEDOR.find((e) => e.value === f.estado);
                    return (
                      <tr
                        key={f.id}
                        className="border-b border-gray-100 transition hover:bg-gray-50"
                      >
                        <td className="px-4 py-3 text-gray-500">{f.codigo}</td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/proveedores/${f.id}`}
                            className="font-semibold text-[#175861] hover:underline"
                          >
                            {f.nombre}
                          </Link>
                          {f.nombreComercial && (
                            <p className="text-xs text-gray-500">{f.nombreComercial}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-700">{f.cuit ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-700">{f.areaSector ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-700">{f.telefono ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${est?.clase ?? 'bg-gray-100 text-gray-600'}`}
                          >
                            {est?.label ?? f.estado}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {f.requisitosVencidos > 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              {f.requisitosVencidos} vencido{f.requisitosVencidos === 1 ? '' : 's'}
                            </span>
                          ) : f.requisitosPendientes > 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              {f.requisitosPendientes} pendiente
                              {f.requisitosPendientes === 1 ? '' : 's'}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {creando && <NuevoProveedor onCerrar={() => setCreando(false)} />}
    </div>
  );
}

// ─── Alta: solo lo indispensable ────────────────────────────────────────────

function NuevoProveedor({ onCerrar }: { onCerrar: () => void }) {
  const router = useRouter();
  const { pending, ejecutar } = useAccion();
  const [razonSocial, setRazonSocial] = useState('');
  const [cuit, setCuit] = useState('');
  const [exterior, setExterior] = useState(false);
  const v = !exterior && cuit.trim() !== '' ? validarCuil(cuit) : null;

  function crear() {
    let nuevoId: string | undefined;
    ejecutar(
      async () => {
        const res = await crearProveedorAction({ razonSocial, cuit, exterior });
        nuevoId = res.id;
        return res;
      },
      'Proveedor creado. Completá el resto de los datos cuando quieras.',
      () => {
        if (nuevoId) router.push(`/proveedores/${nuevoId}`);
        else onCerrar();
      },
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-lg sm:rounded-2xl md:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold" style={{ color: '#101828' }}>
              Nuevo proveedor
            </h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Alcanza con la razón social y el CUIT. El resto es opcional.
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            className="rounded-[8px] p-2 text-gray-400 hover:bg-gray-100"
            onClick={onCerrar}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <Campo label="Razón social o nombre" requerido>
            <input
              autoFocus
              className={inputCls}
              value={razonSocial}
              maxLength={150}
              onChange={(e) => setRazonSocial(e.target.value)}
            />
          </Campo>
          <Campo
            label={exterior ? 'Identificación fiscal (opcional)' : 'CUIT'}
            requerido={!exterior}
            ayuda={exterior ? undefined : 'Con o sin guiones. Se controla el dígito verificador.'}
          >
            <input
              className={inputCls}
              value={cuit}
              maxLength={20}
              inputMode={exterior ? 'text' : 'numeric'}
              placeholder={exterior ? '' : '30-12345678-1'}
              onChange={(e) => setCuit(e.target.value)}
            />
            {v && !v.ok && <p className="mt-1 text-xs text-red-600">{v.error}</p>}
            {v?.ok && <p className="mt-1 text-xs text-[#175861]">CUIT válido.</p>}
          </Campo>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4 cursor-pointer rounded accent-[#175861]"
              checked={exterior}
              onChange={(e) => setExterior(e.target.checked)}
            />
            <span className="text-sm text-gray-700">
              Es un proveedor del exterior (no tiene CUIT argentino)
            </span>
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={botonSecundario} onClick={onCerrar}>
            Cancelar
          </button>
          <button
            type="button"
            className={botonPrimario}
            disabled={pending || !razonSocial.trim() || (!exterior && !cuit.trim())}
            onClick={crear}
          >
            {pending ? 'Creando…' : 'Crear proveedor'}
          </button>
        </div>
      </div>
    </div>
  );
}
