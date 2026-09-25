import { Header } from '@/components/Header';
import { Hero } from '@/components/sections/Hero';
import { Uses } from '@/components/sections/Uses';
import { How } from '@/components/sections/How';
import { Includes } from '@/components/sections/Includes';
import { Demo } from '@/components/sections/Demo';
import { Seguridad } from '@/components/sections/Seguridad';
import { Cobros } from '@/components/sections/Cobros';
import { Comprador } from '@/components/sections/Comprador';
import { Comparacion } from '@/components/sections/Comparacion';
import { Preguntas } from '@/components/sections/Preguntas';
import { Pricing } from '@/components/sections/Pricing';
import { Final } from '@/components/sections/Final';
import { Footer } from '@/components/sections/Footer';
import { StructuredData } from '@/components/seo/StructuredData';

export default function Home() {
  return (
    <>
      <StructuredData />
      <Header />
      <main id="top">
        <Hero />
        <Uses />
        <How />
        <Seguridad />
        <Includes />
        <Cobros />
        <Demo />
        <Comprador />
        <Comparacion />
        <Pricing />
        <Preguntas />
        <Final />
      </main>
      <Footer />
    </>
  );
}
