'use client';

const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=studio.cambalache.nauticaappmobile';
const APP_STORE_URL = 'https://apps.apple.com/app/id6772193507';

// Un solo botón "Descargar app": al click abre el App Store si el dispositivo
// es Apple (iPhone/iPad/Mac) y Google Play en cualquier otro. El href queda
// en Play como fallback (long-press / copiar link).
export function DownloadAppButton({ className }: { className?: string }) {
  return (
    <a
      href={PLAY_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={(e) => {
        if (/iPhone|iPad|iPod|Macintosh/i.test(navigator.userAgent)) {
          e.preventDefault();
          window.open(APP_STORE_URL, '_blank', 'noopener,noreferrer');
        }
      }}
    >
      Descargar app
    </a>
  );
}
