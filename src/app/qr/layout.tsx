import { NOINDEX } from '@/lib/seo';

// Las páginas de QR (portería, invitados) son para quien recibe el link, no
// para buscadores.
export const metadata = NOINDEX;

export default function QrLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
