import { Download, MessageCircle } from 'lucide-react';

export default function AyudaPage() {
  const tel = process.env.NEXT_PUBLIC_SOPORTE_TEL?.trim();
  const numero = tel?.replace(/\D/g, '');
  const whatsappHref = numero ? `https://wa.me/${numero}` : '#';

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div>
        <h1 className="page-title">Ayuda</h1>
        <p className="page-subtitle mt-1">
          Manual paso a paso del panel y soporte directo por WhatsApp.
        </p>
      </div>

      <div className="flex flex-col gap-4 md:flex-row">
        <a
          href="/manual-admin.pdf"
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 items-center gap-3 rounded-[14px] border border-gray-200 bg-white p-4 transition-colors hover:bg-gray-50"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#175861]/10 text-[#175861]">
            <Download className="h-5 w-5" />
          </span>
          <span>
            <span className="block text-sm font-bold text-[#175861]">Descargar el manual</span>
            <span className="block text-xs text-gray-500">Manual del Administrador en PDF</span>
          </span>
        </a>

        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 items-center gap-3 rounded-[14px] border border-gray-200 bg-white p-4 transition-colors hover:bg-gray-50"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#669E9D]/15 text-[#175861]">
            <MessageCircle className="h-5 w-5" />
          </span>
          <span>
            <span className="block text-sm font-bold text-[#175861]">Escribir por WhatsApp</span>
            <span className="block text-xs text-gray-500">
              Soporte directo del equipo NauticApp
            </span>
          </span>
        </a>
      </div>

      <div className="overflow-hidden rounded-[14px] border border-gray-200 bg-white">
        <iframe
          src="/manual-admin.pdf"
          title="Manual del Administrador"
          className="h-[calc(100vh-320px)] min-h-[500px] w-full"
        />
      </div>
    </div>
  );
}
