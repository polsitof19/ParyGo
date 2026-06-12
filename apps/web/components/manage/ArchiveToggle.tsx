'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

type ArchiveAction = (
  id: string,
  archived: boolean
) => Promise<{ ok: boolean; message?: string }>;

/**
 * Botón genérico Archivar / Desarchivar para evento o marca.
 * Recibe la server action por prop (setEventArchivedAction o setBrandArchivedAction).
 * Archivar pide confirmación nativa (defensa contra clics accidentales);
 * desarchivar es inocuo y va directo. Tras éxito hace router.refresh().
 */
export function ArchiveToggle({
  id,
  archived,
  action,
  noun = 'esto',
  confirmText,
}: {
  id: string;
  /** Estado actual: true si ya está archivado. */
  archived: boolean;
  action: ArchiveAction;
  /** Texto para el confirm y el botón, p. ej. "el evento" o "la marca". */
  noun?: string;
  /** Override del mensaje de confirmación al archivar. */
  confirmText?: string;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();

  const onClick = () => {
    if (!archived) {
      const msg =
        confirmText ??
        `¿Archivar ${noun}? Dejará de venderse y desaparece del público. Puedes desarchivarlo después.`;
      if (!window.confirm(msg)) return;
    }
    start(async () => {
      const res = await action(id, !archived);
      if (res.ok) {
        toast.success(archived ? 'Desarchivado' : 'Archivado');
        router.refresh();
      } else {
        toast.error(res.message ?? 'No se pudo completar la acción.');
      }
    });
  };

  return (
    <button
      type="button"
      className={`s-btn ${archived ? 's-btn--primary' : 's-btn--soft'}`}
      disabled={pending}
      onClick={onClick}
      aria-busy={pending}
    >
      {pending ? '…' : archived ? 'Desarchivar' : 'Archivar'}
    </button>
  );
}
