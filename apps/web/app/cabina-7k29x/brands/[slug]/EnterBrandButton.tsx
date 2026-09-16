'use client';

import { useTransition } from 'react';
import { Eye } from 'lucide-react';
import { startImpersonationAction } from '../../impersonation-actions';

// "Entrar a la marca": inicia la impersonación de SOLO LECTURA (gate server-side
// de super admin). La action redirige a /admin con el banner.
//
// variant "icon" es la misma acción en formato compacto, para las acciones
// rápidas de cada fila de la tabla de marcas. Misma server action, mismo gate:
// lo único que cambia es la presentación.
export function EnterBrandButton({ brandId, variant = 'full' }: { brandId: string; variant?: 'full' | 'icon' }) {
  const [pending, start] = useTransition();
  const label = pending ? 'Entrando…' : 'Entrar a la marca';

  if (variant === 'icon') {
    return (
      <button
        type="button"
        className="s-iconbtn"
        disabled={pending}
        title={label}
        aria-label={label}
        onClick={() => start(() => startImpersonationAction(brandId))}
      >
        <Eye />
      </button>
    );
  }

  return (
    <button
      type="button"
      className="s-btn s-btn--peri"
      disabled={pending}
      onClick={() => start(() => startImpersonationAction(brandId))}
    >
      <Eye className="h-4 w-4" /> {label}
    </button>
  );
}
