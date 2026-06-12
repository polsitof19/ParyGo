'use client';

import { useTransition } from 'react';
import { Eye } from 'lucide-react';
import { startImpersonationAction } from '../../impersonation-actions';

// "Entrar a la marca": inicia la impersonación de SOLO LECTURA (gate server-side
// de super admin). La action redirige a /admin con el banner.
export function EnterBrandButton({ brandId }: { brandId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="s-btn s-btn--peri"
      disabled={pending}
      onClick={() => start(() => startImpersonationAction(brandId))}
    >
      <Eye className="h-4 w-4" /> {pending ? 'Entrando…' : 'Entrar a la marca'}
    </button>
  );
}
