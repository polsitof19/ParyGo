'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTextos } from '@/components/IdiomaPanel';

type DeleteAction = (
  id: string,
  confirmName: string
) => Promise<{ ok: boolean; message?: string }>;

/**
 * Botón genérico de BORRADO PERMANENTE para evento o marca.
 *
 * - Solo se debe usar cuando `canDelete` es true (el padre ya verificó que no hay
 *   historial). Si `canDelete` es false, muestra un aviso explicativo en lugar del
 *   botón: hay que archivar.
 * - Al pulsar "Eliminar definitivamente" abre un panel inline donde el usuario DEBE
 *   escribir el nombre exacto para habilitar la confirmación.
 * - Llama a la action (deleteEventAction / deleteBrandAction) con el nombre escrito.
 *   Si vuelve { ok:false } muestra el message (p. ej. "tiene ventas").
 */
export function DangerDeleteButton({
  id,
  name,
  action,
  canDelete,
  noun = 'esto',
  /** Aviso cuando no se puede borrar. Por defecto el de "tiene ventas". */
  cannotDeleteReason,
}: {
  id: string;
  /** Nombre exacto que el usuario debe escribir para confirmar. */
  name: string;
  action: DeleteAction;
  canDelete: boolean;
  noun?: string;
  cannotDeleteReason?: string;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const inputId = useId();
  const helpId = useId();
  const { t } = useTextos();

  if (!canDelete) {
    return (
      <p className="s-banner s-banner--err" role="status">
        {cannotDeleteReason ?? t('No se puede eliminar: tiene ventas. Archívalo en su lugar.', 'Cannot delete: it has sales. Archive it instead.')}
      </p>
    );
  }

  const matches = typed.trim() === name.trim();

  if (!open) {
    return (
      <button
        type="button"
        className="s-btn s-btn--danger-soft"
        onClick={() => {
          setError(null);
          setTyped('');
          setOpen(true);
        }}
      >
        {t('Eliminar definitivamente', 'Delete permanently')}
      </button>
    );
  }

  const onConfirm = () => {
    if (!matches) return;
    setError(null);
    start(async () => {
      const res = await action(id, typed.trim());
      if (res.ok) {
        // El padre revalida; navegamos hacia atrás / refrescamos.
        router.refresh();
      } else {
        setError(res.message ?? t('No se pudo eliminar.', 'Could not delete.'));
      }
    });
  };

  return (
    <div
      className="s-card s-card--confirm-danger"
    >
      <p className="s-card__desc" style={{ marginBottom: 10 }}>
        {t(`Esta acción es permanente y no se puede deshacer. Para confirmar, escribe el nombre exacto de ${noun}:`, `This action is permanent and cannot be undone. To confirm, type the exact name of ${noun}:`)}{' '}
        <strong style={{ color: 'var(--ink)' }}>{name}</strong>
      </p>

      <div className="s-field">
        <label className="s-label" htmlFor={inputId}>
          {t('Escribe el nombre para confirmar', 'Type the name to confirm')}
        </label>
        <input
          id={inputId}
          className="s-input"
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={name}
          autoComplete="off"
          autoFocus
          aria-describedby={helpId}
          aria-invalid={typed.length > 0 && !matches}
          disabled={pending}
        />
        <p id={helpId} className="s-card__desc" style={{ marginTop: 6, fontSize: 12.5 }}>
          {matches ? t('El nombre coincide.', 'The name matches.') : t('Debe coincidir exactamente.', 'It must match exactly.')}
        </p>
      </div>

      {error && (
        <p className="s-banner s-banner--err" role="alert" style={{ marginTop: 10 }}>
          {error}
        </p>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="s-btn s-btn--danger"
          onClick={onConfirm}
          disabled={!matches || pending}
          aria-busy={pending}
        >
          {pending ? t('Eliminando…', 'Deleting…') : t('Eliminar definitivamente', 'Delete permanently')}
        </button>
        <button
          type="button"
          className="s-btn s-btn--ghost"
          onClick={() => {
            setOpen(false);
            setTyped('');
            setError(null);
          }}
          disabled={pending}
        >
          {t('Cancelar', 'Cancel')}
        </button>
      </div>
    </div>
  );
}
