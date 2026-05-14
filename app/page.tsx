import { Header } from '@/components/Header';
import { Hero } from '@/components/sections/Hero';
import { Manifiesto } from '@/components/sections/Manifiesto';
import { Problemas } from '@/components/sections/Problemas';
import { Solucion } from '@/components/sections/Solucion';
import { Packs } from '@/components/sections/Packs';
import { Proceso } from '@/components/sections/Proceso';
import { CasosUso } from '@/components/sections/CasosUso';
import { Faq } from '@/components/sections/Faq';
import { Garantia } from '@/components/sections/Garantia';
import { CtaFooter } from '@/components/sections/CtaFooter';
import { StructuredData } from '@/components/seo/StructuredData';

export default function Home() {
  return (
    <>
      <StructuredData />
      <Header />
      <main>
        <Hero />
        <Manifiesto />
        <Problemas />
        <Solucion />
        <Packs />
        <Proceso />
        <CasosUso />
        <Garantia />
        <Faq />
        <CtaFooter />
      </main>
    </>
  );
}
