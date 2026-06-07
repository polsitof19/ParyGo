import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { CreateBrandForm } from './CreateBrandForm';

export const runtime = 'edge';

export const metadata = {
  title: 'Nueva marca',
};

export default function NewBrandPage() {
  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <Link href="/super" className="s-back">
        <ChevronLeft className="h-3.5 w-3.5" /> Marcas
      </Link>

      <header style={{ marginBottom: 22 }}>
        <span className="eyebrow">Nueva marca</span>
        <h1 className="s-h1" style={{ marginTop: 4 }}>Crear marca y dueño</h1>
        <p className="s-card__desc">
          En un paso: la marca, su subdominio y el dueño con su acceso. El saldo se carga después con un clic.
        </p>
      </header>

      <CreateBrandForm />
    </div>
  );
}
