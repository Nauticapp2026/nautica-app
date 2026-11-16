import type { ReactNode } from 'react';
import { Info } from 'lucide-react';

/**
 * Legajo dado de baja: no se cargan horas, licencias ni vacaciones. Muestra el aviso y deja
 * el contenido deshabilitado (el servidor también lo rechaza). Si no está de baja, no cambia nada.
 */
export function BloqueoPorBaja({ baja, children }: { baja: boolean; children: ReactNode }) {
  if (!baja) return <>{children}</>;
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Este legajo está <strong>dado de baja</strong>: no se pueden cargar horas, licencias ni
          vacaciones. Si vuelve a trabajar, reactivalo cambiando el estado en{' '}
          <strong>Laboral y horario</strong>.
        </p>
      </div>
      <fieldset disabled className="min-w-0 border-0 p-0 opacity-60">
        {children}
      </fieldset>
    </div>
  );
}
