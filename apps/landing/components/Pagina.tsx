import { DICT, type Lang } from '@/lib/i18n';
import { Header } from '@/components/Header';
import { Hero } from '@/components/sections/Hero';
import { Uses } from '@/components/sections/Uses';
import { How } from '@/components/sections/How';
import { Seguridad } from '@/components/sections/Seguridad';
import { Includes } from '@/components/sections/Includes';
import { Cobros } from '@/components/sections/Cobros';
import { Demo } from '@/components/sections/Demo';
import { Comprador } from '@/components/sections/Comprador';
import { Comparacion } from '@/components/sections/Comparacion';
import { Pricing } from '@/components/sections/Pricing';
import { Preguntas } from '@/components/sections/Preguntas';
import { Final } from '@/components/sections/Final';
import { Footer } from '@/components/sections/Footer';
import { StructuredData } from '@/components/seo/StructuredData';

// La landing completa en un idioma. / (español) y /en/ (inglés) la montan.
export function Pagina({ lang }: { lang: Lang }) {
  const t = DICT[lang];
  return (
    <>
      <StructuredData t={t} />
      <Header t={t} />
      <main id="top">
        <Hero t={t} />
        <Uses t={t} />
        <How t={t} />
        <Seguridad t={t} />
        <Includes t={t} />
        <Cobros t={t} />
        <Demo t={t} />
        <Comprador t={t} />
        <Comparacion t={t} />
        <Pricing t={t} />
        <Preguntas t={t} />
        <Final t={t} />
      </main>
      <Footer t={t} />
    </>
  );
}
