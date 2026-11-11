'use client';

import { useState } from 'react';

import { actualizarUbicacionContactoAction } from '@/app/actions/proveedores';
import {
  Campo,
  Selector,
  Tarjeta,
  botonPrimario,
  inputCls,
  textareaCls,
  useAccion,
} from '@/components/shared/form-ui';
import { esEmailValido } from '@/lib/legajo/validaciones';
import type { ProveedorDetalle } from '@/lib/proveedores/consultas';
import { PAISES, PROVINCIAS } from '@/lib/proveedores/constantes';

/** Calle + número + interior (piso / depto / oficina). */
function Domicilio({
  titulo,
  calle,
  numero,
  interior,
  onCalle,
  onNumero,
  onInterior,
}: {
  titulo: string;
  calle: string;
  numero: string;
  interior: string;
  onCalle: (v: string) => void;
  onNumero: (v: string) => void;
  onInterior: (v: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-gray-800">{titulo}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_1fr]">
        <Campo label="Calle">
          <input
            className={inputCls}
            value={calle}
            maxLength={150}
            onChange={(e) => onCalle(e.target.value)}
          />
        </Campo>
        <Campo label="Número">
          <input
            className={inputCls}
            value={numero}
            maxLength={20}
            onChange={(e) => onNumero(e.target.value)}
          />
        </Campo>
        <Campo label="Interior" ayuda="Piso, depto u oficina.">
          <input
            className={inputCls}
            value={interior}
            maxLength={30}
            onChange={(e) => onInterior(e.target.value)}
          />
        </Campo>
      </div>
    </div>
  );
}

export function TabUbicacion({ det }: { det: ProveedorDetalle }) {
  const p = det.proveedor;
  const { pending, ejecutar } = useAccion();
  const [f, setF] = useState({
    dirFiscalCalle: p.dirFiscalCalle ?? '',
    dirFiscalNumero: p.dirFiscalNumero ?? '',
    dirFiscalInterior: p.dirFiscalInterior ?? '',
    dirComercialCalle: p.dirComercialCalle ?? '',
    dirComercialNumero: p.dirComercialNumero ?? '',
    dirComercialInterior: p.dirComercialInterior ?? '',
    codigoPostal: p.codigoPostal ?? '',
    ciudad: p.ciudad ?? '',
    provincia: p.provincia ?? '',
    pais: p.pais,
    contactoNombre: p.contactoNombre ?? '',
    telefono: p.telefono ?? '',
    email: p.email ?? '',
    notas: p.notas ?? '',
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const emailMal = f.email.trim() !== '' && !esEmailValido(f.email.trim());
  const esArgentina = f.pais === 'Argentina';

  return (
    <div className="space-y-6">
      <Tarjeta
        titulo="Ubicación y localización"
        acciones={
          <button
            type="button"
            className={botonPrimario}
            disabled={pending || emailMal}
            onClick={() =>
              ejecutar(() => actualizarUbicacionContactoAction(p.id, f), 'Datos guardados.')
            }
          >
            {pending ? 'Guardando…' : 'Guardar cambios'}
          </button>
        }
      >
        <div className="space-y-5">
          <Domicilio
            titulo="Dirección fiscal"
            calle={f.dirFiscalCalle}
            numero={f.dirFiscalNumero}
            interior={f.dirFiscalInterior}
            onCalle={(v) => set('dirFiscalCalle', v)}
            onNumero={(v) => set('dirFiscalNumero', v)}
            onInterior={(v) => set('dirFiscalInterior', v)}
          />
          <Domicilio
            titulo="Dirección comercial"
            calle={f.dirComercialCalle}
            numero={f.dirComercialNumero}
            interior={f.dirComercialInterior}
            onCalle={(v) => set('dirComercialCalle', v)}
            onNumero={(v) => set('dirComercialNumero', v)}
            onInterior={(v) => set('dirComercialInterior', v)}
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Campo label="Código postal" ayuda="Se usa para validar las facturas electrónicas.">
              <input
                className={inputCls}
                value={f.codigoPostal}
                maxLength={12}
                onChange={(e) => set('codigoPostal', e.target.value)}
              />
            </Campo>
            <Campo label="Ciudad / municipio">
              <input
                className={inputCls}
                value={f.ciudad}
                maxLength={100}
                onChange={(e) => set('ciudad', e.target.value)}
              />
            </Campo>
            <Campo label="País">
              <Selector
                value={f.pais}
                onChange={(v) => set('pais', v)}
                opciones={PAISES}
                placeholder="Elegí el país"
              />
            </Campo>
            <Campo label={esArgentina ? 'Provincia' : 'Estado / provincia / departamento'}>
              {esArgentina ? (
                <Selector
                  value={f.provincia}
                  onChange={(v) => set('provincia', v)}
                  opciones={PROVINCIAS}
                />
              ) : (
                <input
                  className={inputCls}
                  value={f.provincia}
                  maxLength={100}
                  onChange={(e) => set('provincia', e.target.value)}
                />
              )}
            </Campo>
          </div>
        </div>
      </Tarjeta>

      <Tarjeta titulo="Contacto y operación">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Campo
            label="Contacto principal"
            ayuda="Persona encargada de ventas o de cuentas por cobrar."
          >
            <input
              className={inputCls}
              value={f.contactoNombre}
              maxLength={120}
              onChange={(e) => set('contactoNombre', e.target.value)}
            />
          </Campo>
          <Campo label="Teléfono / celular" ayuda="Con prefijo internacional si corresponde.">
            <input
              className={inputCls}
              value={f.telefono}
              maxLength={40}
              onChange={(e) => set('telefono', e.target.value)}
            />
          </Campo>
          <Campo
            label="Correo electrónico de facturación"
            ayuda="Para enviarle órdenes de compra, comprobantes de pago y conciliaciones."
            className="md:col-span-2"
          >
            <input
              type="email"
              className={inputCls}
              value={f.email}
              maxLength={120}
              onChange={(e) => set('email', e.target.value)}
            />
            {emailMal && <p className="mt-1 text-xs text-red-600">El correo no es válido.</p>}
          </Campo>
          <Campo label="Notas" className="md:col-span-2">
            <textarea
              className={textareaCls}
              value={f.notas}
              maxLength={2000}
              onChange={(e) => set('notas', e.target.value)}
            />
          </Campo>
        </div>
      </Tarjeta>
    </div>
  );
}
