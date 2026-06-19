import { Clock } from 'lucide-react';

export default function CobranzasPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100">
        <Clock className="h-8 w-8 text-gray-400" />
      </div>
      <h1 className="text-2xl font-bold text-[#101828]">Cobranzas</h1>
      <p className="mt-2 max-w-sm text-sm text-gray-500">
        Esta sección estará disponible próximamente.
      </p>
    </div>
  );
}
