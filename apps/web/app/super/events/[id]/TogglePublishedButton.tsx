'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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
    <Button
      type="button"
      variant={isPublished ? 'outline' : 'gradient'}
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
      {isPublished ? 'Despublicar' : 'Publicar evento'}
    </Button>
  );
}
