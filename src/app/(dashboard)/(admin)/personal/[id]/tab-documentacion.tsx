'use client';

import { DOCUMENTOS_LEGAJO, GRUPOS_DOCUMENTO } from '@/lib/legajo/constantes';
import type { LegajoDetalle } from '@/lib/legajo/consultas';

import { FilaDocumento } from './documentos-ui';
import { Tarjeta } from '@/components/shared/form-ui';

/**
 * Solapa "Documentación": todos los documentos del legajo agrupados. La operativa y la náutica
 * dependen del puesto, por eso llevan la casilla "Posee" (no se exigen a todos).
 */
export function TabDocumentacion({ det }: { det: LegajoDetalle }) {
  return (
    <div className="space-y-6">
      {GRUPOS_DOCUMENTO.map((g) => {
        const docs = DOCUMENTOS_LEGAJO.filter((d) => d.grupo === g.grupo);
        if (docs.length === 0) return null;
        return (
          <Tarjeta key={g.grupo} titulo={g.titulo} descripcion={g.descripcion}>
            <div className="space-y-2">
              {docs.map((d) => (
                <FilaDocumento
                  key={d.tipo}
                  empleadoId={det.empleado.id}
                  tipo={d.tipo}
                  doc={det.documentos[d.tipo]}
                />
              ))}
            </div>
          </Tarjeta>
        );
      })}
      <p className="text-xs text-gray-500">
        Archivos PDF, JPG, PNG o WebP de hasta 8 MB. Se guardan en un espacio privado: solo los ve
        la administración del club.
      </p>
    </div>
  );
}
