import { Header } from '@/components/Header';
import { Hero } from '@/components/sections/Hero';
import { Uses } from '@/components/sections/Uses';
import { How } from '@/components/sections/How';
import { Includes } from '@/components/sections/Includes';
import { Demo } from '@/components/sections/Demo';
import { ForOrganizers } from '@/components/sections/ForOrganizers';
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
        <Includes />
        <Demo />
        <ForOrganizers />
        <Pricing />
        <Final />
      </main>
      <Footer />
    </>
  );
}
