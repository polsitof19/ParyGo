import type { Metadata } from 'next';
import Link from 'next/link';
import { Bricolage_Grotesque, Hanken_Grotesk } from 'next/font/google';
import '../styles/parygo-tokens.css';
import './empezar.css';

export const runtime = 'edge';

// Las dos familias de la landing: esta página es la continuación de
// parygo.com ("Empezar"), así que va en el mundo de papel, no en el tema noche.
const bricolage = Bricolage_Grotesque({ subsets: ['latin'], weight: ['700', '800'], variable: '--font-bricolage', display: 'swap' });
const hanken = Hanken_Grotesk({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-hanken', display: 'swap' });

export const metadata: Metadata = {
  title: 'Crea tu marca · ParyGo',
  description: 'Elige tu pack o empieza con la prueba gratis y ten tu página tumarca.parygo.com lista para vender entradas.',
};

export default function EmpezarLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`pg ez ${bricolage.variable} ${hanken.variable}`}>
      <header className="ez-top">
        <a href="https://parygo.com" className="ez-brand" aria-label="parygo, volver al inicio">
          parygo<span className="ez-dot">.</span>
        </a>
        <p className="ez-top__login">
          ¿Ya tienes cuenta? <Link href="/login">Entrar</Link>
        </p>
      </header>
      {children}
    </div>
  );
}
