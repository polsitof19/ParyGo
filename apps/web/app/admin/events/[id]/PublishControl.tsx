'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import Link from 'next/link';
import { Eye, EyeOff, Send, Wallet } from 'lucide-react';
import { useTextos } from '@/components/IdiomaPanel';
import { setEventPublishedAction } from './edit-actions';

// Control de estado Borrador/Publicado en la vista del evento.
// - Borrador: banner prominente con explicación + botón "Publicar evento".
// - Publicado: confirmación discreta + opción de volver a borrador.
// - faltaMetodo: el evento COBRA y la marca no tiene método de pago
//   (lib/metodoPago.ts). Borrador: el único primario es "Elegir método de pago"
//   y "Publicar" queda apagado con su motivo. Publicado: aviso de que no puede
//   cobrar. Un evento gratis nunca llega acá.
export function PublishControl({ eventId, isPublished, impersonating = false, faltaMetodo = false }: { eventId: string; isPublished: boolean; impersonating?: boolean; faltaMetodo?: boolean }) {
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

  const metodo = faltaMetodo && (
    <div className="s-due" role="status">
      <Wallet className="h-5 w-5" aria-hidden="true" />
      <div>
        <strong>{isPublished ? t('Tu evento no puede cobrar: falta tu método de pago.', 'Your event cannot charge: your payment method is missing.') : t('Antes de publicar, elige cómo te pagan.', 'Before publishing, choose how you get paid.')}</strong>
        <p className="a-publish__sub">{t('Este evento vende entradas con precio. Sin un método de pago nadie puede pagarte.', 'This event sells paid tickets. Without a payment method nobody can pay you.')}</p>
        <Link href="/admin/settings#cobro" className="s-btn s-btn--primary s-btn--sm">{t('Elegir método de pago', 'Choose payment method')}</Link>
      </div>
    </div>
  );

  if (!isPublished) {
    return (
      <>
      {metodo}
      <div className="a-publish a-publish--draft">
        <div className="a-publish__txt">
          <EyeOff className="h-5 w-5" />
          <span>
            <strong>{t('Borrador — solo tú lo ves.', 'Draft — only you can see it.')}</strong>
            <span className="a-publish__sub">{t('Publica para que aparezca en tu página y la gente pueda comprar.', 'Publish it so it appears on your page and people can buy.')}</span>
          </span>
        </div>
        {/* Con el método faltante el primario es "Elegir método de pago": acá
            un secundario apagado que dice por qué. */}
        <button type="button" className={faltaMetodo ? 's-btn s-btn--soft' : 's-btn s-btn--primary'} disabled={pending || faltaMetodo} onClick={() => flip(true)}
          aria-describedby={faltaMetodo ? 'motivo-publicar' : undefined}>
          <Send className="h-4 w-4" /> {pending ? t('Publicando…', 'Publishing…') : t('Publicar evento', 'Publish event')}
        </button>
        {faltaMetodo && <span id="motivo-publicar" className="a-publish__sub">{t('Falta tu método de pago', 'Your payment method is missing')}</span>}
      </div>
      </>
    );
  }

  return (
    <>
    {metodo}
    <div className="a-publish a-publish--live">
      <div className="a-publish__txt">
        <Eye className="h-5 w-5" />
        <span><strong>{t('Publicado', 'Published')}</strong> {t('— visible en tu página pública.', '— visible on your public page.')}</span>
      </div>
      <button type="button" className="s-btn s-btn--ghost s-btn--sm" disabled={pending} onClick={() => flip(false)}>
        {pending ? '…' : t('Volver a borrador', 'Back to draft')}
      </button>
    </div>
    </>
  );
}
