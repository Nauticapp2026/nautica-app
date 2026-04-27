import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { Header } from '@/components/landing/header';
import { Hero } from '@/components/landing/hero';
import { ComoFunciona } from '@/components/landing/como-funciona';
import { GestionFeatures } from '@/components/landing/gestion-features';
import { Navega } from '@/components/landing/navega';
import { Ecosistema } from '@/components/landing/ecosistema';
import { Pricing } from '@/components/landing/pricing';
import { PorQue } from '@/components/landing/por-que';
import { Footer } from '@/components/landing/footer';

export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect('/dashboard');

  return (
    <>
      <Header />
      <main>
        <Hero />
        <ComoFunciona />
        <GestionFeatures />
        <Navega />
        <Ecosistema />
        <Pricing />
        <PorQue />
      </main>
      <Footer />
    </>
  );
}
