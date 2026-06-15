import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { CreateBrandForm } from './CreateBrandForm';

export const runtime = 'edge';

export const metadata = {
  title: 'Nueva marca',
};

export default function NewBrandPage({ searchParams }: { searchParams: { request?: string; name?: string; email?: string } }) {
  // Prefill al aprobar una solicitud (Grupo C): nombre + email vienen de la cola;
  // el request_id deja que el alta marque la solicitud como aprobada al crear.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const requestId = searchParams.request && UUID_RE.test(searchParams.request) ? searchParams.request : undefined;
  const initialName = requestId ? (searchParams.name ?? '') : '';
  const initialEmail = requestId ? (searchParams.email ?? '') : '';

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <Link href={requestId ? '/cabina-7k29x/solicitudes' : '/cabina-7k29x'} className="s-back">
        <ChevronLeft className="h-3.5 w-3.5" /> {requestId ? 'Solicitudes' : 'Marcas'}
      </Link>

      <header style={{ marginBottom: 22 }}>
        <span className="eyebrow">{requestId ? 'Aprobar solicitud' : 'Nueva marca'}</span>
        <h1 className="s-h1" style={{ marginTop: 4 }}>Crear marca y dueño</h1>
        <p className="s-card__desc">
          En un paso: la marca, su subdominio y el dueño con su acceso. El saldo se carga después con un clic.
        </p>
      </header>

      <CreateBrandForm requestId={requestId} initialName={initialName} initialEmail={initialEmail} />
    </div>
  );
}
