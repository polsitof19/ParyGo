'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { removeBrandAdminAction } from './actions';

/**
 * Botón "Quitar" un admin de la marca (solo super admin).
 * Deshabilitado si es el ÚLTIMO admin (la guarda real igual vive en el server).
 * Pide confirmación nativa antes de quitar.
 */
export function RemoveBrandAdminButton({
  brandId,
  userId,
  email,
  isLast,
}: {
  brandId: string;
  userId: string;
  email: string;
  isLast: boolean;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();

  const onClick = () => {
    if (isLast) return;
    if (!window.confirm(`¿Quitar a ${email} como admin de esta marca? Conserva su cuenta; solo pierde el acceso a esta marca.`)) return;
    start(async () => {
      const res = await removeBrandAdminAction(brandId, userId);
      if (res.ok) {
        toast.success('Admin quitado');
        router.refresh();
      } else {
        toast.error(res.message ?? 'No se pudo quitar el admin.');
      }
    });
  };

  return (
    <button
      type="button"
      className="s-btn s-btn--ghost s-btn--sm"
      onClick={onClick}
      disabled={pending || isLast}
      aria-disabled={isLast}
      title={isLast ? 'No puedes quitar al único admin. Asigna otro antes.' : 'Quitar de esta marca'}
    >
      {pending ? 'Quitando…' : 'Quitar'}
    </button>
  );
}
