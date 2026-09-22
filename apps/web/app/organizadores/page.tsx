import { Bricolage_Grotesque, Hanken_Grotesk } from 'next/font/google';
import type { Metadata } from 'next';
import { RequestAccessForm } from './RequestAccessForm';
import '../login/login.css';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Pedir acceso · ParyGo para organizadores',
  description: 'Vende las entradas de tus eventos con tu propia marca, cobrando tú directo. Pide acceso a ParyGo.',
};

const bricolage = Bricolage_Grotesque({ weight: ['700', '800'], subsets: ['latin'], variable: '--font-bricolage', display: 'swap' });
const hanken = Hanken_Grotesk({ weight: ['300', '400', '500', '600', '700'], subsets: ['latin'], variable: '--font-hanken', display: 'swap' });

export default function OrganizadoresPage() {
  return (
    <main className={`auth-shell ${bricolage.variable} ${hanken.variable}`}>
      <div className="auth-wrap">
        <div className="auth-brand">parygo<span className="dot">.</span></div>
        <RequestAccessForm />
        <p className="auth-legal">Creas una solicitud — no se crea nada todavía. Revisamos cada caso a mano antes de dar acceso.</p>
      </div>
    </main>
  );
}
