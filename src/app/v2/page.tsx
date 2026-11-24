import { Header } from '@/components/landing-v2/header';
import { Hero } from '@/components/landing-v2/hero';
import { ComoFunciona } from '@/components/landing-v2/como-funciona';
import { GestionFeatures } from '@/components/landing-v2/gestion-features';
import { Navega } from '@/components/landing-v2/navega';
// import { Ecosistema } from '@/components/landing-v2/ecosistema'; // oculto momentáneamente
import { Pricing } from '@/components/landing-v2/pricing';
import { PorQue } from '@/components/landing-v2/por-que';
import { Footer } from '@/components/landing-v2/footer';
import { WhatsappFlotante } from '@/components/landing-v2/whatsapp-flotante';

// Versión 2 de la landing (borrador de diseño). Copia de `/` sin el redirect
// de usuarios logueados, para poder verla siempre. No indexable.
export default function HomeV2() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <ComoFunciona />
        <GestionFeatures />
        <Navega />
        {/* <Ecosistema /> — oculto momentáneamente */}
        <Pricing />
        <PorQue />
      </main>
      <Footer />
      <WhatsappFlotante />
    </>
  );
}
