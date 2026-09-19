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
//
// brandName es para el nombre accesible: en la tabla hay un botón por fila y
// sin el nombre de la marca un lector de pantalla los lista todos iguales.
export function EnterBrandButton({
  brandId,
  brandName,
  variant = 'full',
}: {
  brandId: string;
  brandName?: string;
  variant?: 'full' | 'icon';
}) {
  const [pending, start] = useTransition();
  const label = pending ? 'Entrando…' : 'Entrar a la marca';
  const a11y = brandName ? (pending ? `Entrando a ${brandName}` : `Entrar a ${brandName}`) : label;

  if (variant === 'icon') {
    return (
      <button
        type="button"
        className="s-rowbtn"
        disabled={pending}
        title={a11y}
        aria-label={a11y}
        onClick={() => start(() => startImpersonationAction(brandId))}
      >
        <Eye />
      </button>
    );
  }

  return (
    <button
      type="button"
      className="s-btn s-btn--soft s-brandhead__cta"
      disabled={pending}
      onClick={() => start(() => startImpersonationAction(brandId))}
    >
      <Eye className="h-4 w-4" /> {label}
    </button>
  );
}
