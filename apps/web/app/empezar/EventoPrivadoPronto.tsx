import { MessageCircle, Mail } from 'lucide-react';
import type { Lang } from './textos';
import { TEXTOS } from './textos';

// "Muy pronto" del evento privado (Paul, 2026-09-28): no perder a quien lo
// busca, sin construir el flujo real todavía. Mismo número de soporte que
// /login (NEXT_PUBLIC_SUPPORT_WHATSAPP); si no está seteado, se oculta.
export function EventoPrivadoPronto({ lang, volverHref }: { lang: Lang; volverHref: string }) {
  const t = TEXTOS[lang].tipo.pronto;
  const support = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP;
  const texto = lang === 'en' ? 'Hi! I want to organize a private event on ParyGo.' : '¡Hola! Quiero organizar un evento privado en ParyGo.';

  return (
    <main className="ez-main ez-main--solo" lang={lang}>
      <div className="ez-col">
        <a href={volverHref} className="ez-volver">{t.volver}</a>
        <h1 className="ez-h1">{t.h1}</h1>
        <p className="ez-lede">{t.sub}</p>
        <div className="ez-actions ez-actions--top">
          {support && (
            <a href={`https://wa.me/${support}?text=${encodeURIComponent(texto)}`} target="_blank" rel="noopener noreferrer" className="ez-btn ez-btn--primary">
              <MessageCircle aria-hidden="true" className="ez-btn__ico" /> {t.wa}
            </a>
          )}
          <a href="mailto:parygoasistencia@gmail.com" className="ez-btn ez-btn--soft">
            <Mail aria-hidden="true" className="ez-btn__ico" /> {t.correo}
          </a>
        </div>
      </div>
    </main>
  );
}
