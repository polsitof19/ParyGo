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
    <main className="c-narrow" style={{ paddingTop: 48, paddingBottom: 56, maxWidth: 480, margin: '0 auto' }}>
      <div style={{ textAlign: 'center' }}>
        <span className="c-eyebrow">¿Perdiste tu entrada?</span>
        <h1 className="c-h1" style={{ fontSize: 28, marginTop: 8 }}>Reenviá tu entrada</h1>
        <p className="c-muted" style={{ marginTop: 10 }}>
          Poné el email con el que compraste en {brand.name} y te reenviamos tus QR al instante.
        </p>
      </div>

      <ResendForm />

      {brand.whatsapp_e164 && (
        <p className="c-muted-3" style={{ textAlign: 'center', fontSize: 12.5, marginTop: 18 }}>
          ¿Seguís sin recibirla?{' '}
          <a href={`https://wa.me/${brand.whatsapp_e164.replace(/[^\d]/g, '')}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand-ink)', fontWeight: 600 }}>
            Escribinos por WhatsApp
          </a>
        </p>
      )}
    </main>
  );
}
