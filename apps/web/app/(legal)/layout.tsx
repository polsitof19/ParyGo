import Link from 'next/link';
import './legal.css';

export const runtime = 'edge';


export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`legal-shell`}>
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
