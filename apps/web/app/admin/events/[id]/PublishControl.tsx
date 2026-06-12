'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { Eye, EyeOff, Send } from 'lucide-react';
import { setEventPublishedAction } from './edit-actions';

// Control de estado Borrador/Publicado en la vista del evento.
// - Borrador: banner prominente con explicación + botón "Publicar evento".
// - Publicado: confirmación discreta + opción de volver a borrador.
export function PublishControl({ eventId, isPublished, impersonating = false }: { eventId: string; isPublished: boolean; impersonating?: boolean }) {
  const [pending, start] = useTransition();

  const flip = (publish: boolean) =>
    start(async () => {
      const res = await setEventPublishedAction(eventId, publish);
      if (res.ok) toast.success(publish ? '¡Evento publicado! Ya aparece en tu página.' : 'Evento despublicado. Volvió a borrador.');
      else toast.error(res.message ?? 'No se pudo cambiar el estado.');
    });

  // Solo lectura (super admin viendo la marca): mostramos el estado sin el toggle.
  if (impersonating) {
    return (
      <div className={`a-publish ${isPublished ? 'a-publish--live' : 'a-publish--draft'}`}>
        <div className="a-publish__txt">
          {isPublished ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
          <span><strong>{isPublished ? 'Publicado' : 'Borrador'}</strong> — solo lectura.</span>
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
            <strong>Borrador — solo vos lo ves.</strong>
            <span className="a-publish__sub">Publicá para que aparezca en tu página y la gente pueda comprar.</span>
          </span>
        </div>
        <button type="button" className="s-btn s-btn--primary" disabled={pending} onClick={() => flip(true)}>
          <Send className="h-4 w-4" /> {pending ? 'Publicando…' : 'Publicar evento'}
        </button>
      </div>
    );
  }

  return (
    <div className="a-publish a-publish--live">
      <div className="a-publish__txt">
        <Eye className="h-5 w-5" />
        <span><strong>Publicado</strong> — visible en tu página pública.</span>
      </div>
      <button type="button" className="s-btn s-btn--soft s-btn--sm" disabled={pending} onClick={() => flip(false)}>
        {pending ? '…' : 'Volver a borrador'}
      </button>
    </div>
  );
}
