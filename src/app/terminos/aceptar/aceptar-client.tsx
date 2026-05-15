'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { MarkdownView } from '@/components/shared/markdown-view';
import { aceptarTerminosAction } from '@/app/actions/terminos';

const TZ_AR = 'America/Argentina/Buenos_Aires';

function formatFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', {
    timeZone: TZ_AR,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function AceptarTerminosClient({
  version,
  contenido,
  publicadoEn,
  next,
}: {
  version: number;
  contenido: string;
  publicadoEn: string;
  next: string;
}) {
  const router = useRouter();
  const [acepta, setAcepta] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit() {
    if (!acepta) return;
    startTransition(async () => {
      const res = await aceptarTerminosAction({ version });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success('Términos aceptados.');
      router.push(next);
      router.refresh();
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F9FAFB] p-4">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-gray-200 px-6 py-4">
          <h1 className="text-lg font-bold text-[#101828]">Términos y Condiciones</h1>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Versión {version} · publicada el {formatFecha(publicadoEn)}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <MarkdownView source={contenido} />
        </div>

        <div className="border-t border-gray-200 px-6 py-4">
          <label className="mb-4 flex items-start gap-3 text-sm text-gray-700">
            <Checkbox
              checked={acepta}
              onCheckedChange={(v) => setAcepta(v === true)}
              disabled={pending}
              className="mt-0.5"
            />
            <span>
              Leí y acepto los Términos y Condiciones de NauticApp en su versión {version}.
            </span>
          </label>
          <div className="flex justify-end">
            <Button onClick={handleSubmit} disabled={!acepta || pending}>
              {pending ? 'Guardando…' : 'Aceptar y continuar'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
