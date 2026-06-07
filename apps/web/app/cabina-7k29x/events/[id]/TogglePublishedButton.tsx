'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { setEventPublishedAction } from './actions';

export function TogglePublishedButton({
  eventId,
  isPublished,
}: {
  eventId: string;
  isPublished: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className={`s-btn ${isPublished ? 's-btn--soft' : 's-btn--primary'}`}
      disabled={pending}
      onClick={() => {
        start(async () => {
          const res = await setEventPublishedAction(eventId, !isPublished);
          if (res.ok) {
            toast.success(isPublished ? 'Evento despublicado' : 'Evento publicado');
          } else {
            toast.error(res.message ?? 'Error');
          }
        });
      }}
    >
      {pending ? '…' : isPublished ? 'Despublicar' : 'Publicar evento'}
    </button>
  );
}
