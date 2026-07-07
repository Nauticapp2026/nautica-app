'use client';

import { Printer } from 'lucide-react';

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="flex items-center gap-2 rounded-[10px] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
      style={{ background: '#175861' }}
    >
      <Printer className="h-4 w-4" />
      Imprimir
    </button>
  );
}
