'use client';

import { useEffect, useRef, useState } from 'react';
import QRCodeStyling from 'qr-code-styling';
import { Logo } from '@/components/shared/logo';
import { QrCode, UserPlus, Wrench, X } from 'lucide-react';

const PRIMARY = '#175861';
const HEADER = '#669999';

type Invitado = {
  nombre: string;
  cantidadAcompanantes: number;
  esTecnico: boolean;
  motivoTecnico: string | null;
};

type Props = {
  id: string;
  clubName: string | null;
  socioFirstName: string | null;
  socioFullName: string | null;
  invitados: Invitado[];
  estado: string | null;
};

export function GuestQrView({
  id,
  clubName,
  socioFirstName,
  socioFullName,
  invitados,
  estado,
}: Props) {
  const [showQr, setShowQr] = useState(false);

  const isExpired = estado === 'revocado' || estado === 'usado';
  const clubLabel = clubName || '—';
  const totalPersonas = invitados.reduce((acc, i) => acc + 1 + (i.cantidadAcompanantes ?? 0), 0);

  if (showQr) {
    return <QrFullScreen id={id} onClose={() => setShowQr(false)} isExpired={isExpired} />;
  }

  return (
    <section className="flex w-full max-w-md flex-col gap-6 rounded-3xl bg-white p-6 shadow-2xl">
      <div className="flex items-center justify-center">
        <Logo size={44} />
      </div>

      <div
        className="flex items-center gap-3 rounded-2xl px-4 py-4 text-white"
        style={{
          background: `linear-gradient(135deg, ${PRIMARY} 0%, ${HEADER} 100%)`,
        }}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20">
          <UserPlus size={18} color="#ffffff" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold">¡Has sido invitado!</p>
          <p className="text-xs opacity-90">
            {socioFirstName
              ? `${socioFirstName} te ha invitado a unirte a ${clubLabel}`
              : 'Un socio te ha invitado a la guardería'}
          </p>
        </div>
      </div>

      <Field label="Nombre del Marinero/Club" value={clubLabel} />
      <Field label="Socio" value={socioFullName || '—'} />

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-semibold" style={{ color: '#101828' }}>
          Invitados ({totalPersonas})
        </label>
        {invitados.length === 0 ? (
          <p className="text-sm text-gray-500">Sin invitados registrados</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {invitados.map((inv, idx) => (
              <li
                key={`${inv.nombre}-${idx}`}
                className="flex flex-col gap-1 rounded-[10px] border border-gray-200 bg-white px-4 py-2 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium" style={{ color: '#101828' }}>
                      {inv.nombre}
                    </span>
                    {inv.esTecnico && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                        style={{ background: PRIMARY }}
                      >
                        <Wrench size={10} /> Técnico
                      </span>
                    )}
                  </div>
                  {!inv.esTecnico && (
                    <span className="text-xs whitespace-nowrap text-gray-500">
                      + {inv.cantidadAcompanantes}{' '}
                      {inv.cantidadAcompanantes === 1 ? 'acompañante' : 'acompañantes'}
                    </span>
                  )}
                </div>
                {inv.esTecnico && inv.motivoTecnico && (
                  <p className="text-xs text-gray-500">Motivo: {inv.motivoTecnico}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={() => setShowQr(true)}
        disabled={isExpired}
        className="flex items-center justify-center gap-2 rounded-[10px] py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        style={{ background: PRIMARY }}
      >
        <QrCode size={18} /> Mostrar QR de Invitado
      </button>

      {isExpired && (
        <p className="text-center text-xs text-red-600">
          Este código ya no está activo. Pedile uno nuevo al socio.
        </p>
      )}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold" style={{ color: '#101828' }}>
        {label}
      </label>
      <input
        readOnly
        value={value}
        className="h-11 w-full rounded-[10px] border border-gray-200 bg-white px-4 text-sm outline-none"
      />
    </div>
  );
}

function QrFullScreen({
  id,
  onClose,
  isExpired,
}: {
  id: string;
  onClose: () => void;
  isExpired: boolean;
}) {
  const qrRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!qrRef.current) return;
    qrRef.current.innerHTML = '';
    const qr = new QRCodeStyling({
      width: 280,
      height: 280,
      type: 'svg',
      data: id,
      margin: 0,
      backgroundOptions: { color: PRIMARY },
      dotsOptions: { color: '#ffffff', type: 'rounded' },
      cornersSquareOptions: { color: '#ffffff', type: 'extra-rounded' },
      cornersDotOptions: { color: '#ffffff', type: 'dot' },
      qrOptions: { errorCorrectionLevel: 'H' },
    });
    qr.append(qrRef.current);
  }, [id]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col px-4 py-6" style={{ background: '#ffffff' }}>
      <button
        type="button"
        onClick={onClose}
        className="absolute top-5 right-5 p-2 transition hover:opacity-70"
        style={{ color: PRIMARY }}
        aria-label="Cerrar"
      >
        <X size={22} />
      </button>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-between py-10">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <QrCode size={26} color={PRIMARY} />
            <h1 className="text-2xl font-bold" style={{ color: PRIMARY }}>
              Código QR de Acceso
            </h1>
          </div>
          <p className="text-sm" style={{ color: PRIMARY, opacity: 0.75 }}>
            Escaneá este código en el lector de la guardería para ingresar rápidamente.
          </p>
        </div>

        <div className="flex items-center justify-center">
          <div
            className="relative flex items-center justify-center"
            style={{ background: PRIMARY, width: 320, height: 320, borderRadius: 24, padding: 20 }}
          >
            <div ref={qrRef} className="flex items-center justify-center" />
            <div
              className="absolute top-1/2 left-1/2 flex items-center justify-center"
              style={{
                width: 86,
                height: 86,
                borderRadius: '50%',
                background: PRIMARY,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <Logo size={62} showText={false} />
            </div>
          </div>
        </div>

        <div className="text-center">
          <a
            href="#"
            className="text-sm font-semibold underline-offset-4 hover:underline"
            style={{ color: PRIMARY }}
          >
            Descargar la APP
          </a>
          {isExpired && <p className="mt-3 text-xs text-red-500">Este código ya no está activo.</p>}
        </div>
      </div>
    </div>
  );
}
