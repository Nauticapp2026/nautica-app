import { NOINDEX } from '@/lib/seo';

export const metadata = NOINDEX;

export default function V2Layout({ children }: { children: React.ReactNode }) {
  return children;
}
