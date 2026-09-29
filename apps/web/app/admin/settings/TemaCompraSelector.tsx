'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTextos } from '@/components/IdiomaPanel';
import { brandFillPair } from '@/lib/brandColors';
import { paletaCompra, type TemaCompra } from '@/lib/temaCompra.mjs';
import { cambiarTemaCompraAction } from './actions';

// Cómo ven los compradores la página de la marca (0076, Paul 2026-09-28):
// blanco, crema, negro o el color de la marca. Cada opción muestra una VISTA
// PREVIA con la paleta real (lib/temaCompra.mjs, la misma de la página y del
// test de contraste) y el color guardado de la marca: fondo, texto, punto de
// marca y el botón de comprar. Se guarda al tocar.
export function TemaCompraSelector({ tema, primary, disabled }: { tema: TemaCompra; primary: string; disabled: boolean }) {
  const { t } = useTextos();
  const router = useRouter();
  const [elegido, setElegido] = useState<TemaCompra>(tema);
  const [pendiente, start] = useTransition();
  const [error, setError] = useState(false);

  const opciones: { v: TemaCompra; nombre: string }[] = [
    { v: 'blanco', nombre: t('Blanco', 'White') },
    { v: 'crema', nombre: t('Crema', 'Cream') },
    { v: 'negro', nombre: t('Negro', 'Black') },
    { v: 'marca', nombre: t('Tu color', 'Your color') },
  ];

  function elegir(v: TemaCompra) {
    if (v === elegido || disabled) return;
    const antes = elegido;
    setElegido(v);
    setError(false);
    start(async () => {
      const r = await cambiarTemaCompraAction(v);
      if (!r.ok) { setElegido(antes); setError(true); return; }
      router.refresh();
    });
  }

  return (
    <fieldset className="s-card" style={{ border: 0, padding: 0, margin: '0 0 var(--s-s4)' }} disabled={disabled || pendiente}>
      <legend className="s-h2" style={{ padding: 0, marginBottom: 'var(--s-s1)' }}>{t('Cómo ven tu página tus compradores', 'How buyers see your page')}</legend>
      <p className="s-card__desc" style={{ marginBottom: 'var(--s-s2)' }}>
        {t('Elige el fondo de tu página de compra. La entrada con QR siempre es blanca. Se guarda al tocar.', 'Choose the background of your purchase page. The QR ticket is always white. It saves when you tap.')}
      </p>
      <div role="radiogroup" aria-label={t('Tema de la página de compra', 'Purchase page theme')} style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--s-s2)' }}>
        {opciones.map(({ v, nombre }) => {
          const p = paletaCompra(v, primary);
          const btn = p.boton ?? (() => { const b = brandFillPair(primary, 'neutra'); return { fill: b.fill, onFill: b.on }; })();
          const on = elegido === v;
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => elegir(v)}
              className="s-tema"
              style={{
                display: 'grid', gap: 'var(--s-s1)', textAlign: 'left', padding: 'var(--s-s1)',
                borderRadius: 'var(--r-ctl)', border: on ? '2px solid var(--ink)' : '1px solid var(--line)',
                background: 'transparent', color: 'var(--ink)', cursor: 'pointer', font: 'inherit',
              }}
            >
              {/* La miniatura: la paleta real de ese tema con TU color. */}
              <span aria-hidden="true" style={{ display: 'grid', gap: 6, padding: 'var(--s-s2)', borderRadius: 'var(--r-ctl)', background: p.hex.bg, border: `1px solid ${p.vars['--line']}` }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.hex.mark, flex: 'none' }} />
                  <span style={{ color: p.hex.ink, fontWeight: 600, fontSize: 'var(--s-meta)' }}>{t('Tu evento', 'Your event')}</span>
                </span>
                <span style={{ color: p.hex.ink2, fontSize: 'var(--s-micro)' }}>{t('Sáb · 10:00 p. m.', 'Sat · 10:00 p.m.')}</span>
                <span style={{ display: 'block', textAlign: 'center', padding: '6px 0', borderRadius: 'var(--r-pill)', background: btn.fill, color: btn.onFill, fontWeight: 600, fontSize: 'var(--s-micro)' }}>
                  {t('Comprar entradas', 'Buy tickets')}
                </span>
              </span>
              <span style={{ fontSize: 'var(--s-ctl)', fontWeight: on ? 600 : 500 }}>{nombre}{on ? ` · ${t('elegido', 'selected')}` : ''}</span>
            </button>
          );
        })}
      </div>
      {error && <p className="s-hint" role="alert" style={{ marginTop: 'var(--s-s2)' }}>{t('No se pudo guardar. Intenta de nuevo.', 'Could not save. Please try again.')}</p>}
    </fieldset>
  );
}
