import { NOINDEX } from '@/lib/seo';

import './v2.css';

export const metadata = NOINDEX;

export default function V2Layout({ children }: { children: React.ReactNode }) {
  return <div className="v2">{children}</div>;
}
