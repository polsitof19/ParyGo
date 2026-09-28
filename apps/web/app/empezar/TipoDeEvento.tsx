import { Store, PartyPopper } from 'lucide-react';
import type { Lang } from './textos';
import { TEXTOS } from './textos';

// Primera pantalla de /empezar (Paul, 2026-09-28): antes de los paquetes de
// marca, pregunta qué va a organizar. Sin JS: son dos links que agregan
// ?tipo=... a la URL actual (page.tsx decide qué mostrar). `qs` ya trae
// pack/moneda/lang/cancelado tal como llegaron, para no perderlos.
export function TipoDeEvento({ lang, qs }: { lang: Lang; qs: URLSearchParams }) {
  const t = TEXTOS[lang].tipo;
  const href = (tipo: 'marca' | 'privado') => {
    const q = new URLSearchParams(qs);
    q.set('tipo', tipo);
    return `?${q.toString()}`;
  };

  return (
    <main className="ez-main ez-main--solo" lang={lang}>
      <div className="ez-col">
        <h1 className="ez-h1">{t.h1}</h1>
        <p className="ez-lede">{t.sub}</p>
        <div className="ez-tipo">
          <a href={href('marca')} className="ez-tipo__card">
            <Store className="ez-tipo__ico" aria-hidden="true" />
            <span className="ez-tipo__t">{t.marca.t}</span>
            <span className="ez-tipo__d">{t.marca.d}</span>
          </a>
          <a href={href('privado')} className="ez-tipo__card">
            <PartyPopper className="ez-tipo__ico" aria-hidden="true" />
            <span className="ez-tipo__t">
              {t.privado.t}
              <span className="ez-tag"><span className="ez-tag__dot" aria-hidden="true" />{t.privado.badge}</span>
            </span>
            <span className="ez-tipo__d">{t.privado.d}</span>
          </a>
        </div>
      </div>
    </main>
  );
}
