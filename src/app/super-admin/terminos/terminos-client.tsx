'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { MarkdownView } from '@/components/shared/markdown-view';
import { publicarVersionTerminosAction } from '@/app/actions/super-admin/terminos';

const TZ_AR = 'America/Argentina/Buenos_Aires';

function formatFecha(iso: string) {
  return new Date(iso).toLocaleString('es-AR', {
    timeZone: TZ_AR,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type VersionRow = {
  id: string;
  version: number;
  contenido: string;
  publicadoEn: string;
};

export function TerminosClient({ versiones }: { versiones: VersionRow[] }) {
  const router = useRouter();
  const vigente = versiones[0];

  const [mode, setMode] = useState<'view' | 'new'>('view');
  const [borrador, setBorrador] = useState('');
  const [openVersion, setOpenVersion] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  function comenzarNueva() {
    setBorrador(vigente?.contenido ?? '');
    setMode('new');
  }

  function publicar() {
    if (
      !confirm(
        `¿Publicar la versión ${(vigente?.version ?? 0) + 1}?\n\nTodos los usuarios van a tener que aceptarla en su próximo ingreso.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await publicarVersionTerminosAction({ contenido: borrador });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`Versión ${res.version} publicada.`);
      setMode('view');
      router.refresh();
    });
  }

  if (mode === 'new') {
    const proximaVersion = (vigente?.version ?? 0) + 1;
    return (
      <Card className="space-y-4 p-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-[#175861]">Nueva versión {proximaVersion}</h2>
          <button
            type="button"
            onClick={() => setMode('view')}
            disabled={pending}
            className="text-sm text-gray-500 underline hover:text-gray-700 disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>

        <p className="text-muted-foreground text-xs">
          Soporta markdown básico: <code>#</code> <code>##</code> <code>###</code> para títulos,{' '}
          <code>**negrita**</code>, <code>- item</code> para listas, líneas vacías separan párrafos.
        </p>

        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-700">Contenido</label>
            <Textarea
              value={borrador}
              onChange={(e) => setBorrador(e.target.value)}
              rows={24}
              className="font-mono text-xs"
              disabled={pending}
            />
          </div>
          <div>
            <p className="mb-1 block text-xs font-semibold text-gray-700">Vista previa</p>
            <div className="max-h-[600px] overflow-y-auto rounded-md border border-gray-200 bg-white p-4">
              {borrador.trim() ? (
                <MarkdownView source={borrador} />
              ) : (
                <p className="text-muted-foreground text-sm">Empezá a escribir…</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={publicar} disabled={pending || borrador.trim().length < 50}>
            {pending ? 'Publicando…' : `Publicar versión ${proximaVersion}`}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={comenzarNueva}>Publicar nueva versión</Button>
      </div>

      {versiones.length === 0 ? (
        <Card className="p-6">
          <p className="text-muted-foreground text-sm">No hay versiones publicadas todavía.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {versiones.map((v, idx) => {
            const isVigente = idx === 0;
            const isOpen = openVersion === v.version;
            return (
              <Card key={v.id} className="p-4">
                <button
                  type="button"
                  onClick={() => setOpenVersion(isOpen ? null : v.version)}
                  className="flex w-full items-center justify-between text-left"
                >
                  <div>
                    <p className="font-semibold text-[#175861]">
                      Versión {v.version}{' '}
                      {isVigente && (
                        <span className="ml-2 inline-flex rounded-full bg-[#D9EBE9] px-2 py-0.5 text-xs font-semibold text-[#175861]">
                          Vigente
                        </span>
                      )}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Publicada el {formatFecha(v.publicadoEn)}
                    </p>
                  </div>
                  <span className="text-muted-foreground text-xs">
                    {isOpen ? 'Cerrar' : 'Ver contenido'}
                  </span>
                </button>
                {isOpen && (
                  <div className="mt-4 max-h-[500px] overflow-y-auto rounded-md border border-gray-200 bg-white p-4">
                    <MarkdownView source={v.contenido} />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
