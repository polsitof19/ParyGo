import type { Dict } from '@/lib/i18n';
import { Resaltado } from '@/components/Resaltado';

// 04 — Todo lo que incluye cada evento. Íconos en el mismo orden que t.inc.items.
const svg = (d: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
const FEATURE = svg(<><rect x="2" y="5" width="20" height="14" rx="3" /><path d="M2 10h20" /></>);
const ICONOS = [
  svg(<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />),
  svg(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 9l9 6 9-6" /></>),
  svg(<><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><path d="M14 14h3v3" /><path d="M21 14v3" /><path d="M14 21h7" /></>),
  svg(<><path d="M3 17l6-6 4 4 7-7" /><path d="M14 8h7v7" /></>),
  svg(<><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></>),
  svg(<path d="M22 12h-4l-3 9L9 3l-3 9H2" />),
  svg(<><circle cx="12" cy="12" r="10" /><path d="M8 12h8" /><path d="M12 8v8" /></>),
  svg(<><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>),
  svg(<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" />),
];

export function Includes({ t }: { t: Dict }) {
  const c = t.inc;
  return (
    <section className="section includes" id="incluye" aria-labelledby="inc-title">
      <div className="blob includes__blob" aria-hidden="true" />
      <div className="container">
        <div className="section__head center reveal">
          <h2 className="h2" id="inc-title"><Resaltado r={c.h2} /></h2>
        </div>

        <div className="inc-grid reveal-stagger">
          <article className="inc inc--feature">
            <div className="inc__icon" aria-hidden="true">{FEATURE}</div>
            <div className="inc__title">{c.feature[0]}<span className="accent">{c.feature[1]}</span></div>
          </article>
          {c.items.map((it, i) => (
            <article key={it} className="inc">
              <div className="inc__icon" aria-hidden="true">{ICONOS[i]}</div>
              <div className="inc__title">{it}</div>
            </article>
          ))}
        </div>

        <p className="includes__note reveal">{c.note}</p>
      </div>
    </section>
  );
}
