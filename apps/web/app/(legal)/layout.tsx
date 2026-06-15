import { Bricolage_Grotesque, Hanken_Grotesk } from 'next/font/google';
import Link from 'next/link';
import './legal.css';

export const runtime = 'edge';

const bricolage = Bricolage_Grotesque({ weight: ['700', '800'], subsets: ['latin'], variable: '--font-bricolage', display: 'swap' });
const hanken = Hanken_Grotesk({ weight: ['400', '500', '600', '700'], subsets: ['latin'], variable: '--font-hanken', display: 'swap' });

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`legal-shell ${bricolage.variable} ${hanken.variable}`}>
      <header className="legal-top">
        <Link href="/" className="legal-brand">parygo<span className="dot">.</span></Link>
        <nav className="legal-nav">
          <Link href="/terminos">Términos</Link>
          <Link href="/privacidad">Privacidad</Link>
        </nav>
      </header>
      <main className="legal-wrap">{children}</main>
      <footer className="legal-foot">parygo · Plataforma de venta de entradas para eventos en Perú</footer>
    </div>
  );
}
