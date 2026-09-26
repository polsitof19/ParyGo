import type { Metadata } from 'next';
import { requireBrand } from '@/lib/brand';
import { ResendForm } from './ResendForm';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Reenviar mi entrada', robots: { index: false, follow: false } };
}

export default async function ResendPage() {
  const brand = await requireBrand(); // 404 si el host no resuelve a una marca

  return (
    <main className="c-state">
      <div>
        <span className="c-eyebrow">¿Perdiste tu entrada?</span>
        <h1 className="c-h1">Reenvía tu entrada</h1>
        <p className="c-muted">
          Pon el email con el que compraste en {brand.name} y te reenviamos tus QR al instante.
        </p>
      </div>

      <ResendForm />

      {brand.whatsapp_e164 && (
        <p className="c-muted-3" style={{ marginTop: 'var(--b-s3)' }}>
          ¿Sigues sin recibirla?{' '}
          <a href={`https://wa.me/${brand.whatsapp_e164.replace(/[^\d]/g, '')}`} target="_blank" rel="noopener noreferrer" className="c-inlink">
            Escríbenos por WhatsApp
          </a>
        </p>
      )}
    </main>
  );
}
