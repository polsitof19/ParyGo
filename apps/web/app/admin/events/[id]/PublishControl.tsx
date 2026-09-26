'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { Eye, EyeOff, Send } from 'lucide-react';
import { useTextos } from '@/components/IdiomaPanel';
import { setEventPublishedAction } from './edit-actions';

// Control de estado Borrador/Publicado en la vista del evento.
// - Borrador: banner prominente con explicación + botón "Publicar evento".
// - Publicado: confirmación discreta + opción de volver a borrador.
export function PublishControl({ eventId, isPublished, impersonating = false }: { eventId: string; isPublished: boolean; impersonating?: boolean }) {
  const { t } = useTextos();
  const [pending, start] = useTransition();

  const flip = (publish: boolean) =>
    start(async () => {
      const res = await setEventPublishedAction(eventId, publish);
      if (res.ok) toast.success(publish ? t('¡Evento publicado! Ya aparece en tu página.', 'Event published! It now appears on your page.') : t('Evento despublicado. Volvió a borrador.', 'Event unpublished. Back to draft.'));
      else toast.error(res.message ?? t('No se pudo cambiar el estado.', 'Could not change the status.'));
    });

  // Solo lectura (super admin viendo la marca): mostramos el estado sin el toggle.
  if (impersonating) {
    return (
      <div className={`a-publish ${isPublished ? 'a-publish--live' : 'a-publish--draft'}`}>
        <div className="a-publish__txt">
          {isPublished ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
          <span><strong>{isPublished ? t('Publicado', 'Published') : t('Borrador', 'Draft')}</strong> {t('— solo lectura.', '— read-only.')}</span>
        </div>
      </div>
    );
  }

  if (!isPublished) {
    return (
      <div className="a-publish a-publish--draft">
        <div className="a-publish__txt">
          <EyeOff className="h-5 w-5" />
          <span>
            <strong>{t('Borrador — solo tú lo ves.', 'Draft — only you can see it.')}</strong>
            <span className="a-publish__sub">{t('Publica para que aparezca en tu página y la gente pueda comprar.', 'Publish it so it appears on your page and people can buy.')}</span>
          </span>
        </div>
        <button type="button" className="s-btn s-btn--primary" disabled={pending} onClick={() => flip(true)}>
          <Send className="h-4 w-4" /> {pending ? t('Publicando…', 'Publishing…') : t('Publicar evento', 'Publish event')}
        </button>
      </div>
    );
  }

  return (
    <div className="a-publish a-publish--live">
      <div className="a-publish__txt">
        <Eye className="h-5 w-5" />
        <span><strong>{t('Publicado', 'Published')}</strong> {t('— visible en tu página pública.', '— visible on your public page.')}</span>
      </div>
      <button type="button" className="s-btn s-btn--ghost s-btn--sm" disabled={pending} onClick={() => flip(false)}>
        {pending ? '…' : t('Volver a borrador', 'Back to draft')}
      </button>
    </div>
  );
}
