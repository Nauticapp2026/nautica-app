'use client';

import { useState } from 'react';
import { Link2, Link2Off } from 'lucide-react';

import { actualizarPersonalesAction, vincularUsuarioAction } from '@/app/actions/legajo';
import { GENEROS, LABEL_ROL, TIPOS_DOCUMENTO_PERSONA } from '@/lib/legajo/constantes';
import type { LegajoDetalle, UsuarioVinculable } from '@/lib/legajo/consultas';
import { validarCuil } from '@/lib/legajo/validaciones';

import { AdjuntoInline } from './documentos-ui';
import {
  Campo,
  Selector,
  Tarjeta,
  botonPrimario,
  botonSecundario,
  inputCls,
  useAccion,
} from '@/components/shared/form-ui';

export function TabPersonales({
  det,
  vinculables,
}: {
  det: LegajoDetalle;
  vinculables: UsuarioVinculable[];
}) {
  const e = det.empleado;
  const { pending, ejecutar } = useAccion();
  const [f, setF] = useState({
    nombre: e.nombre,
    apellido: e.apellido,
    tipoDocumento: e.tipoDocumento,
    nroDocumento: e.nroDocumento,
    cuilCuit: e.cuilCuit ?? '',
    fechaNacimiento: e.fechaNacimiento ?? '',
    genero: e.genero ?? '',
    direccion: e.direccion ?? '',
    localidad: e.localidad ?? '',
    provincia: e.provincia ?? '',
    telefono: e.telefono ?? '',
    email: e.email ?? '',
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  // Aviso en vivo del CUIL: el servidor es la validación real.
  const cuil = f.cuilCuit.trim() === '' ? null : validarCuil(f.cuilCuit);

  return (
    <div className="space-y-6">
      <Tarjeta
        titulo="Datos personales"
        descripcion="Tal como figuran en el documento de identidad del trabajador."
        acciones={
          <button
            type="button"
            className={botonPrimario}
            disabled={pending}
            onClick={() =>
              ejecutar(() => actualizarPersonalesAction(e.id, f), 'Datos personales guardados.')
            }
          >
            {pending ? 'Guardando…' : 'Guardar cambios'}
          </button>
        }
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Campo label="Nombres" requerido>
            <input
              className={inputCls}
              value={f.nombre}
              maxLength={80}
              onChange={(x) => set('nombre', x.target.value)}
            />
          </Campo>
          <Campo label="Apellidos" requerido>
            <input
              className={inputCls}
              value={f.apellido}
              maxLength={80}
              onChange={(x) => set('apellido', x.target.value)}
            />
          </Campo>
          <Campo label="Tipo de documento" requerido>
            <Selector
              value={f.tipoDocumento}
              onChange={(v) => set('tipoDocumento', v)}
              opciones={TIPOS_DOCUMENTO_PERSONA}
              placeholder="Elegí el tipo"
            />
          </Campo>
          <Campo label="Nº de documento" requerido ayuda="Sin puntos ni espacios (ej: 40123456).">
            <input
              className={inputCls}
              value={f.nroDocumento}
              maxLength={30}
              inputMode={f.tipoDocumento === 'dni' ? 'numeric' : 'text'}
              onChange={(x) => set('nroDocumento', x.target.value)}
            />
          </Campo>
          <Campo label="CUIL / CUIT" ayuda="Con o sin guiones. Se controla el dígito verificador.">
            <input
              className={inputCls}
              value={f.cuilCuit}
              maxLength={20}
              placeholder="20-40123456-0"
              onChange={(x) => set('cuilCuit', x.target.value)}
            />
            {cuil && !cuil.ok && <p className="mt-1 text-xs text-red-600">{cuil.error}</p>}
            {cuil?.ok && <p className="mt-1 text-xs text-[#175861]">CUIL/CUIT válido.</p>}
          </Campo>
          <Campo label="Fecha de nacimiento">
            <input
              type="date"
              className={inputCls}
              value={f.fechaNacimiento}
              onChange={(x) => set('fechaNacimiento', x.target.value)}
            />
          </Campo>
          <Campo label="Género" ayuda="Para los registros previsionales.">
            <Selector value={f.genero} onChange={(v) => set('genero', v)} opciones={GENEROS} />
          </Campo>
          <Campo label="Teléfono de contacto" ayuda="Celular o fijo, con código de área.">
            <input
              className={inputCls}
              value={f.telefono}
              maxLength={40}
              onChange={(x) => set('telefono', x.target.value)}
            />
          </Campo>
          <Campo
            label="Domicilio real actual"
            ayuda="Calle, número, piso y departamento."
            className="md:col-span-2"
          >
            <input
              className={inputCls}
              value={f.direccion}
              maxLength={200}
              onChange={(x) => set('direccion', x.target.value)}
            />
          </Campo>
          <Campo label="Localidad">
            <input
              className={inputCls}
              value={f.localidad}
              maxLength={100}
              onChange={(x) => set('localidad', x.target.value)}
            />
          </Campo>
          <Campo label="Provincia">
            <input
              className={inputCls}
              value={f.provincia}
              maxLength={100}
              onChange={(x) => set('provincia', x.target.value)}
            />
          </Campo>
          <Campo
            label="Email personal"
            ayuda="Para el envío de recibos digitales y avisos."
            className="md:col-span-2"
          >
            <input
              type="email"
              className={inputCls}
              value={f.email}
              maxLength={120}
              onChange={(x) => set('email', x.target.value)}
            />
          </Campo>
        </div>

        <div className="mt-5">
          <p className="mb-2 text-sm font-medium text-gray-700">Copia del documento de identidad</p>
          <AdjuntoInline
            empleadoId={e.id}
            tipo="documento_identidad"
            doc={det.documentos['documento_identidad']}
          />
        </div>
      </Tarjeta>

      <UsuarioDelSistema det={det} vinculables={vinculables} />
    </div>
  );
}

/**
 * Vínculo OPCIONAL con un usuario del sistema. El legajo es una entidad propia: este vínculo
 * solo reconoce a la persona y, a pedido, completa el email y el teléfono vacíos (una sola vez).
 */
function UsuarioDelSistema({
  det,
  vinculables,
}: {
  det: LegajoDetalle;
  vinculables: UsuarioVinculable[];
}) {
  const e = det.empleado;
  const { pending, ejecutar } = useAccion();
  const [elegido, setElegido] = useState('');
  const [copiar, setCopiar] = useState(true);

  return (
    <Tarjeta
      titulo="Usuario del sistema"
      descripcion="Opcional. Hay personal que no usa el sistema, y el legajo se conserva aunque la cuenta cambie o se elimine."
    >
      {det.usuario ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Link2 className="mt-0.5 h-5 w-5 shrink-0 text-[#175861]" />
            <div>
              <p className="text-sm font-semibold text-gray-900">{det.usuario.nombre}</p>
              <p className="text-xs text-gray-500">
                {det.usuario.email ?? 'Sin email'}
                {det.usuario.rol && ` · ${LABEL_ROL[det.usuario.rol] ?? det.usuario.rol}`}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                El acceso y el rol se administran en Mi perfil → Equipo; vincular no los cambia.
              </p>
            </div>
          </div>
          <button
            type="button"
            className={botonSecundario}
            disabled={pending}
            onClick={() => {
              if (
                window.confirm('¿Desvincular el usuario? El legajo y el usuario siguen existiendo.')
              ) {
                ejecutar(() => vincularUsuarioAction(e.id, null, false), 'Usuario desvinculado.');
              }
            }}
          >
            <span className="inline-flex items-center gap-1.5">
              <Link2Off className="h-4 w-4" />
              Desvincular
            </span>
          </button>
        </div>
      ) : vinculables.length === 0 ? (
        <p className="text-sm text-gray-500">
          No hay usuarios del equipo sin legajo para vincular. Esta persona no necesita tener
          usuario.
        </p>
      ) : (
        <div className="space-y-3">
          <Campo label="Vincular con un usuario del equipo">
            <select
              className={inputCls}
              value={elegido}
              onChange={(x) => setElegido(x.target.value)}
            >
              <option value="">Elegí un usuario</option>
              {vinculables.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre} · {LABEL_ROL[u.rol] ?? u.rol}
                </option>
              ))}
            </select>
          </Campo>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4 cursor-pointer rounded accent-[#175861]"
              checked={copiar}
              onChange={(x) => setCopiar(x.target.checked)}
            />
            <span className="text-sm text-gray-700">
              Completar el email y el teléfono vacíos con los del usuario
            </span>
          </label>
          <button
            type="button"
            className={botonPrimario}
            disabled={pending || !elegido}
            onClick={() =>
              ejecutar(
                () => vincularUsuarioAction(e.id, elegido, copiar),
                'Usuario vinculado.',
                () => setElegido(''),
              )
            }
          >
            Vincular usuario
          </button>
        </div>
      )}
    </Tarjeta>
  );
}
