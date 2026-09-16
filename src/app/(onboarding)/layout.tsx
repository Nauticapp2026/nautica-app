import { NOINDEX } from '@/lib/seo';

export const metadata = NOINDEX;

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
