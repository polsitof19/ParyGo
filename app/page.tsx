import { Header } from '@/components/Header';
import { Hero } from '@/components/sections/Hero';
import { PorQueExistimos } from '@/components/sections/PorQueExistimos';
import { Demo } from '@/components/sections/Demo';
import { Proceso } from '@/components/sections/Proceso';
import { Features } from '@/components/sections/Features';
import { Precios } from '@/components/sections/Precios';
import { Garantia } from '@/components/sections/Garantia';
import { CtaFinal } from '@/components/sections/CtaFinal';
import { Footer } from '@/components/sections/Footer';
import { StructuredData } from '@/components/seo/StructuredData';

export default function Home() {
  return (
    <>
      <StructuredData />
      <Header />
      <main>
        <Hero />
        <PorQueExistimos />
        <Demo />
        <Proceso />
        <Features />
        <Precios />
        <Garantia />
        <CtaFinal />
      </main>
      <Footer />
    </>
  );
}
