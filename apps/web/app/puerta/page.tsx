import { ScanLine } from 'lucide-react';

import { RedeemForm } from './RedeemForm';
import '../scan/scan.css';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Puerta · ParyGo',
  robots: { index: false, follow: false },
};


export default function PuertaPage() {
  return (
    <div className={`scan-shell`}>
      <main className="k-gate">
        <div className="k-gate__card">
          <div className="k-gate__badge"><ScanLine className="h-7 w-7" /></div>
          <span className="k-eyebrow">Puerta</span>
          <h1 className="k-h1" style={{ marginTop: 4 }}>Acceso de staff</h1>
          <p className="k-muted" style={{ marginTop: 6, marginBottom: 20 }}>Ingresa tu código personal de 8 caracteres.</p>
          <RedeemForm />
          {/* El link va en TINTA con subrayado, no en el naranja de marca:
              #FF6A3D sobre la crema da 2,66:1 y el acento no porta texto.
              Además es el único link de la pantalla, así que su área de toque
              llega a 44 (medía 87x17). */}
          <p className="k-muted" style={{ marginTop: 18, fontSize: 12.5 }}>
            ¿Eres organizador o entras con email?{' '}
            <a href="/login?next=/scan" className="k-link">Entra con tu email y contraseña</a>
          </p>
        </div>
      </main>
    </div>
  );
}
