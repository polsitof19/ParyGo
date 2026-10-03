import { Suspense } from 'react';
import { Bricolage_Grotesque, Hanken_Grotesk } from 'next/font/google';
import { Cabecera } from './Cabecera';
import '../styles/parygo-tokens.css';
import './empezar.css';

export const runtime = 'edge';

// Las dos familias de la landing: esta página es la continuación de
// parygo.com ("Comenzar"), así que va en el mundo de papel, no en el tema noche.
// El título y la descripción los pone cada página según el idioma (?lang=en).
const bricolage = Bricolage_Grotesque({ subsets: ['latin'], weight: ['700', '800'], variable: '--font-bricolage', display: 'swap' });
const hanken = Hanken_Grotesk({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-hanken', display: 'swap' });

export default function EmpezarLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`pg ez ${bricolage.variable} ${hanken.variable}`}>
      <Suspense fallback={<div className="ez-top" />}>
        <Cabecera />
      </Suspense>
      {children}
    </div>
  );
}
