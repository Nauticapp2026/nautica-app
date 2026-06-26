'use client';

import { useTransition } from 'react';
import { Mail } from 'lucide-react';
import { toast } from 'sonner';

import { enviarReciboPorMailAction } from '@/app/actions/facturacion';

export function EnviarReciboMailButton({
  reciboId,
  socioEmail,
}: {
  reciboId: string;
  socioEmail: string | null;
}) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const res = await enviarReciboPorMailAction(reciboId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`Recibo enviado a ${res.email}`);
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending || !socioEmail}
      title={socioEmail ? `Enviar a ${socioEmail}` : 'El socio no tiene email cargado'}
      className="flex items-center gap-2 rounded-[10px] border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Mail className="h-4 w-4" />
      {isPending ? 'Enviando…' : 'Enviar por mail'}
    </button>
  );
}
