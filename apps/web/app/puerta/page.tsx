import { ScanLine } from 'lucide-react';
import { Bricolage_Grotesque, Hanken_Grotesk } from 'next/font/google';
import { RedeemForm } from './RedeemForm';
import '../scan/scan.css';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Puerta · ParyGo',
  robots: { index: false, follow: false },
};

const bricolage = Bricolage_Grotesque({ weight: ['700', '800'], subsets: ['latin'], variable: '--font-bricolage', display: 'swap' });
const hanken = Hanken_Grotesk({ weight: ['400', '500', '600', '700'], subsets: ['latin'], variable: '--font-hanken', display: 'swap' });

export default function PuertaPage() {
  return (
    <div className={`scan-shell ${bricolage.variable} ${hanken.variable}`}>
      <main className="k-gate">
        <div className="k-gate__card">
          <div className="k-gate__badge"><ScanLine className="h-7 w-7" /></div>
          <span className="k-eyebrow">Puerta</span>
          <h1 className="k-h1" style={{ marginTop: 4 }}>Acceso de staff</h1>
          <p className="k-muted" style={{ marginTop: 6, marginBottom: 20 }}>Ingresá tu código personal de 8 caracteres.</p>
          <RedeemForm />
          <p className="k-muted" style={{ marginTop: 18, fontSize: 12.5 }}>
            ¿Sos organizador? <a href="/login" style={{ color: 'var(--tangerine)', fontWeight: 600 }}>Entrá por email</a>
          </p>
        </div>
      </main>
    </div>
  );
}
